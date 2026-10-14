import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProcedureService } from '../../database/procedure.service.js';
import {
  ConsolidationInputItem,
  runConsolidationEngine,
} from './domain/consolidation-engine.js';
import {
  suggestDeliveriesForPair,
  addDaysIso,
} from './domain/suggest-deliveries.js';
import {
  GetPoOptionsQueryDto,
  GetWeekPlanQueryDto,
  PlanItemDto,
  SaveWeekPlanDto,
  SuggestPlanDto,
} from './dto/delivery-plans.dto.js';

@Injectable()
export class DeliveryPlansService {
  constructor(private readonly procedureService: ProcedureService) {}

  private handleSqlError(err: any): never {
    const msg: string = err?.message || '';
    const number: number = err?.number || 0;
    const cleanMsg = msg.replace(/^\[50\d{3}\]\s*/, '');

    if (number === 50403 || msg.includes('[50403]')) {
      throw new ForbiddenException(cleanMsg || 'Bạn không có quyền thao tác trên nhà máy này.');
    }
    if (number === 50404 || msg.includes('[50404]')) {
      throw new NotFoundException(cleanMsg || 'Không tìm thấy dữ liệu yêu cầu.');
    }
    if (number === 50400 || msg.includes('[50400]')) {
      throw new BadRequestException(cleanMsg || 'Dữ liệu đầu vào không hợp lệ.');
    }
    throw err;
  }

  private toIsoDate(val: unknown): string {
    if (!val) return '';
    if (val instanceof Date) {
      return val.toISOString().slice(0, 10);
    }
    const str = String(val);
    return str.length >= 10 ? str.slice(0, 10) : str;
  }

  /**
   * Tạo mảng 7 ngày liên tiếp từ Thứ 2 đến Chủ nhật (YYYY-MM-DD)
   */
  private generateWeekDates(weekStartDate: string): string[] {
    const dates: string[] = [];
    const base = new Date(weekStartDate + 'T00:00:00Z');
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  /**
   * Lấy kế hoạch giao hàng tuần và thực hiện đối chiếu tự động với phiếu nhận thực tế POR (BR-26b)
   */
  async getWeekPlan(userId: number, query: GetWeekPlanQueryDto) {
    try {
      const sets = await this.procedureService.executeMultiSetProcedure(
        'dbo.usp_DeliveryPlan_GetWeek',
        {
          UserID: userId,
          WeekStartDate: query.weekStartDate,
          FactoryID: query.factoryId ?? null,
          MaterialID: query.materialId ?? null,
        },
      );

      const rawPlans = sets[0] || [];
      const rawReceipts = sets[1] || [];
      const rawPos = sets[2] || [];

      const days = this.generateWeekDates(query.weekStartDate);
      const weekEndDate = days[6];

      // 1. Nhóm các dòng kế hoạch theo cặp NM - NL - NCC - PO
      const grouped = new Map<string, any>();

      for (const p of rawPlans) {
        const poKey = p.PONumber ? p.PONumber.trim() : 'NO_PO';
        const rowKey = `${p.FactoryID}_${p.MaterialID}_${p.SupplierID}_${poKey}`;

        if (!grouped.has(rowKey)) {
          const dailyObj: Record<string, any> = {};
          for (const d of days) {
            dailyObj[d] = {
              planId: null,
              planQtyKg: 0,
              planQtyTons: 0,
              receivedQtyKg: 0,
              receivedQtyTons: 0,
              missingQtyKg: 0,
              missingQtyTons: 0,
              note: null,
            };
          }

          grouped.set(rowKey, {
            rowKey,
            factoryId: Number(p.FactoryID),
            factoryCode: p.FactoryCode,
            factoryName: p.FactoryName,
            materialId: Number(p.MaterialID),
            materialCode: p.MaterialCode,
            materialName: p.MaterialName,
            category: p.Category ?? null,
            itemGroup: p.ItemGroup ?? null,
            bagKg: p.BagKg != null ? Number(p.BagKg) : null,
            displayDecimals: p.DisplayDecimals != null ? Number(p.DisplayDecimals) : 2,
            supplierId: Number(p.SupplierID),
            supplierCode: p.SupplierCode,
            supplierName: p.SupplierName,
            poNumber: p.PONumber ? p.PONumber.trim() : null,
            deliverRemainderKg: null,
            deliverRemainderTons: null,
            hasOverPoWarning: false,
            overPoWarningMessage: null,
            daily: dailyObj,
            weeklySummary: {
              totalPlanKg: 0,
              totalPlanTons: 0,
              totalReceivedKg: 0,
              totalReceivedTons: 0,
              totalMissingKg: 0,
              totalMissingTons: 0,
            },
          });
        }

        const item = grouped.get(rowKey);
        const planDate = this.toIsoDate(p.PlanDate);
        if (item.daily[planDate]) {
          item.daily[planDate].planId = Number(p.PlanID);
          item.daily[planDate].planQtyKg += Number(p.PlanQtyKg || 0);
          item.daily[planDate].planQtyTons = +(
            item.daily[planDate].planQtyKg / 1000
          ).toFixed(3);
          item.daily[planDate].note = p.Note ?? null;
        }
      }

      // 2. Thuật toán Đối chiếu Thực nhận POR (Domain Reconciliation Engine - BR-26b)
      const usedReceiptIds = new Set<string>();

      // Bước 2.1: Khớp dòng có số PO
      for (const pr of rawReceipts) {
        const prPo = pr.PONumber ? pr.PONumber.trim() : null;
        const prPag = pr.PAGNumber ? pr.PAGNumber.trim() : null;

        if (!prPo && !prPag) continue;

        for (const item of grouped.values()) {
          if (!item.poNumber) continue;
          if (
            item.factoryId === Number(pr.FactoryID) &&
            item.materialId === Number(pr.MaterialID) &&
            (item.poNumber === prPo || item.poNumber === prPag)
          ) {
            const rDate = this.toIsoDate(pr.ReceiptDate);
            if (item.daily[rDate]) {
              item.daily[rDate].receivedQtyKg += Number(pr.ReceivedQtyKg || 0);
              item.daily[rDate].receivedQtyTons = +(
                item.daily[rDate].receivedQtyKg / 1000
              ).toFixed(3);
              usedReceiptIds.add(String(pr.ReceiptID));
              break;
            }
          }
        }
      }

      // Bước 2.2: Khớp các phiếu POR còn lại vào dòng không có PO của cùng NCC và cặp NM-NL
      for (const pr of rawReceipts) {
        if (usedReceiptIds.has(String(pr.ReceiptID))) continue;

        for (const item of grouped.values()) {
          if (item.poNumber) continue; // chỉ khớp vào dòng KHÔNG PO
          if (
            item.factoryId === Number(pr.FactoryID) &&
            item.materialId === Number(pr.MaterialID) &&
            item.supplierId === Number(pr.SupplierID)
          ) {
            const rDate = this.toIsoDate(pr.ReceiptDate);
            if (item.daily[rDate]) {
              item.daily[rDate].receivedQtyKg += Number(pr.ReceivedQtyKg || 0);
              item.daily[rDate].receivedQtyTons = +(
                item.daily[rDate].receivedQtyKg / 1000
              ).toFixed(3);
              usedReceiptIds.add(String(pr.ReceiptID));
              break;
            }
          }
        }
      }

      // Bước 2.3: Danh sách các phiếu nhận chưa khớp vào dòng kế hoạch nào (Unplanned Receipts)
      const unplannedReceipts = rawReceipts
        .filter((pr: any) => !usedReceiptIds.has(String(pr.ReceiptID)))
        .map((pr: any) => ({
          receiptId: Number(pr.ReceiptID),
          receiptNumber: pr.ReceiptNumber,
          receiptDate: this.toIsoDate(pr.ReceiptDate),
          factoryId: Number(pr.FactoryID),
          factoryCode: pr.FactoryCode,
          materialId: Number(pr.MaterialID),
          materialCode: pr.MaterialCode,
          supplierId: pr.SupplierID != null ? Number(pr.SupplierID) : null,
          supplierCode: pr.SupplierCode ?? null,
          poNumber: pr.PONumber ?? null,
          pagNumber: pr.PAGNumber ?? null,
          receivedQtyKg: Number(pr.ReceivedQtyKg || 0),
          receivedQtyTons: Number(pr.ReceivedQtyTons || 0),
        }));

      // 3. Tính toán chênh lệch ngày, tổng kết tuần và kiểm tra cảnh báo mềm Over-PO (BR-26d)
      const items = Array.from(grouped.values());

      let totalPlanKgAll = 0;
      let totalReceivedKgAll = 0;

      for (const item of items) {
        let rowPlanKg = 0;
        let rowReceivedKg = 0;

        for (const d of days) {
          const dayData = item.daily[d];
          dayData.missingQtyKg = dayData.planQtyKg - dayData.receivedQtyKg;
          dayData.missingQtyTons = +(dayData.missingQtyKg / 1000).toFixed(3);

          rowPlanKg += dayData.planQtyKg;
          rowReceivedKg += dayData.receivedQtyKg;
        }

        item.weeklySummary.totalPlanKg = rowPlanKg;
        item.weeklySummary.totalPlanTons = +(rowPlanKg / 1000).toFixed(3);
        item.weeklySummary.totalReceivedKg = rowReceivedKg;
        item.weeklySummary.totalReceivedTons = +(rowReceivedKg / 1000).toFixed(3);
        item.weeklySummary.totalMissingKg = rowPlanKg - rowReceivedKg;
        item.weeklySummary.totalMissingTons = +(
          (rowPlanKg - rowReceivedKg) /
          1000
        ).toFixed(3);

        totalPlanKgAll += rowPlanKg;
        totalReceivedKgAll += rowReceivedKg;

        // Cảnh báo mềm Over-PO (BR-26d)
        if (item.poNumber) {
          const matchingPo = rawPos.find(
            (po: any) =>
              Number(po.FactoryID) === item.factoryId &&
              Number(po.MaterialID) === item.materialId &&
              po.PONumber &&
              po.PONumber.trim() === item.poNumber,
          );

          if (matchingPo) {
            item.deliverRemainderKg = Number(matchingPo.DeliverRemainderKg || 0);
            item.deliverRemainderTons = Number(matchingPo.DeliverRemainderTons || 0);

            if (item.weeklySummary.totalPlanKg > item.deliverRemainderKg) {
              item.hasOverPoWarning = true;
              item.overPoWarningMessage = `Tổng kế hoạch (${item.weeklySummary.totalPlanTons} tấn) vượt quá lượng còn lại trên PO (${item.deliverRemainderTons} tấn)`;
            }
          }
        }
      }

      // Tổng kết chung toàn tuần
      const totalMissingKgAll = totalPlanKgAll - totalReceivedKgAll;
      const weeklyTotals = {
        totalPlanKg: totalPlanKgAll,
        totalPlanTons: +(totalPlanKgAll / 1000).toFixed(3),
        totalReceivedKg: totalReceivedKgAll,
        totalReceivedTons: +(totalReceivedKgAll / 1000).toFixed(3),
        totalMissingKg: totalMissingKgAll,
        totalMissingTons: +(totalMissingKgAll / 1000).toFixed(3),
      };

      return {
        weekStartDate: query.weekStartDate,
        weekEndDate,
        days,
        items,
        unplannedReceipts,
        weeklyTotals,
      };
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  /**
   * Lưu toàn bộ lưới kế hoạch tuần trong 1 Transaction nguyên tử duy nhất (nhập TẤN, lưu KG - BR-26, BR-33)
   */
  async saveWeekPlan(
    userId: number,
    username: string,
    dto: SaveWeekPlanDto,
    ipAddress?: string,
  ) {
    try {
      if (!Array.isArray(dto.plans)) {
        throw new BadRequestException('Danh sách kế hoạch phải là một mảng.');
      }

      // Chuẩn hóa và kiểm tra trùng lặp dòng có PO trong cùng 1 ngày (BR-26a)
      const seenPoKeys = new Set<string>();

      const normalizedPlans = dto.plans.map((p, idx) => {
        const poTrimmed = p.poNumber ? p.poNumber.trim() : null;
        if (poTrimmed) {
          const key = `${p.planDate}_${p.materialId}_${p.supplierId}_${poTrimmed}`;
          if (seenPoKeys.has(key)) {
            throw new BadRequestException(
              `Dòng #${idx + 1}: Vi phạm ràng buộc trùng lặp dòng kế hoạch có cùng số PO trong một ngày (${p.planDate}, PO: ${poTrimmed}) (BR-26a).`,
            );
          }
          seenPoKeys.add(key);
        }

        let planKg: number;
        if (p.planQtyKg != null && p.planQtyKg > 0) {
          planKg = Math.round(Number(p.planQtyKg));
        } else if (p.planQtyTons != null && p.planQtyTons > 0) {
          planKg = Math.round(Number(p.planQtyTons) * 1000);
        } else {
          throw new BadRequestException(
            `Dòng #${idx + 1}: Khối lượng giao hàng phải lớn hơn 0 (kg hoặc tấn).`,
          );
        }

        return {
          planDate: p.planDate,
          materialId: Number(p.materialId),
          supplierId: Number(p.supplierId),
          poNumber: poTrimmed,
          planQtyKg: planKg,
          note: p.note ? p.note.trim() : null,
        };
      });

      const plansJson = JSON.stringify(normalizedPlans);

      const result = await this.procedureService.executeProcedure(
        'dbo.usp_DeliveryPlan_SaveWeek',
        {
          UserID: userId,
          Username: username,
          WeekStartDate: dto.weekStartDate,
          FactoryID: dto.factoryId,
          PlansJson: plansJson,
          MaterialID: dto.materialId ?? null,
          MaterialIdsJson: dto.materialIds && dto.materialIds.length > 0 ? JSON.stringify(dto.materialIds) : null,
          IPAddress: ipAddress ?? null,
        },
      );

      const row = (result && result[0]) || {};

      return {
        success: true,
        factoryId: Number(row.FactoryID || dto.factoryId),
        weekStartDate: row.WeekStartDate || dto.weekStartDate,
        weekEndDate: row.WeekEndDate,
        savedCount: Number(row.SavedCount || 0),
        totalPlanKg: Number(row.TotalPlanKg || 0),
        totalPlanTons: Number(row.TotalPlanTons || 0),
      };
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  /**
   * Lấy danh sách PO Pending còn mở để chọn trên dòng kế hoạch giao hàng
   */
  async getPoOptions(query: GetPoOptionsQueryDto) {
    try {
      const rows = await this.procedureService.executeProcedure(
        'dbo.usp_DeliveryPlan_GetPoOptions',
        {
          FactoryID: query.factoryId,
          MaterialID: query.materialId,
          SupplierID: query.supplierId ?? null,
        },
      );

      return rows.map((r: any) => ({
        poPendingId: Number(r.PoPendingID),
        poNumber: r.PONumber,
        docType: r.DocType,
        supplierId: r.SupplierID != null ? Number(r.SupplierID) : null,
        supplierCode: r.SupplierCode ?? null,
        supplierName: r.SupplierName ?? null,
        orderQtyKg: Number(r.OrderQtyKg || 0),
        orderQtyTons: Number(r.OrderQtyTons || 0),
        deliverRemainderKg: Number(r.DeliverRemainderKg || 0),
        deliverRemainderTons: Number(r.DeliverRemainderTons || 0),
        deliveryDate: this.toIsoDate(r.DeliveryDate),
      }));
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  /**
   * Đề xuất các chuyến giao nháp lên lưới tuần theo thuật toán BR-36b (JRP Truckload Consolidation)
   * Không lưu vào CSDL, chỉ trả về danh sách các chuyến nháp để Planner xem & tinh chỉnh
   */
  async suggestWeekPlans(userId: number, dto: SuggestPlanDto) {
    try {
      const sets = await this.procedureService.executeMultiSetProcedure(
        'dbo.usp_DeliveryPlan_GetConsolidationData',
        {
          UserID: userId,
          FactoryID: dto.factoryId,
          WeekStartDate: dto.weekStartDate,
          MaterialID: dto.materialId ?? null,
        },
      );

      const factoryMeta = sets[0]?.[0] || {};
      const rawItems = sets[1] || [];
      const rawPos = sets[2] || [];
      const rawExistingPlans = sets[3] || [];
      const weekEndDate = factoryMeta.WeekEndDate || addDaysIso(dto.weekStartDate, 6);

      // Nhóm Open POs theo MaterialID
      const posByMaterial = new Map<number, any[]>();
      for (const po of rawPos) {
        const mId = Number(po.MaterialID);
        if (!posByMaterial.has(mId)) {
          posByMaterial.set(mId, []);
        }
        posByMaterial.get(mId)!.push({
          poPendingId: Number(po.PoPendingID),
          poNumber: po.PONumber ? po.PONumber.trim() : '',
          deliveryDate: this.toIsoDate(po.DeliveryDate),
          supplierId: po.SupplierID ? Number(po.SupplierID) : undefined,
          supplierCode: po.SupplierCode,
          supplierName: po.SupplierName,
          leadTimeDays: Number(po.LeadTimeDays || 7),
          deliverRemainderKg: Number(po.DeliverRemainderKg || 0),
        });
      }

      // Nhóm Existing Plans theo MaterialID
      const existingPlansByMaterial = new Map<number, any[]>();
      for (const plan of rawExistingPlans) {
        const mId = Number(plan.MaterialID);
        if (!existingPlansByMaterial.has(mId)) {
          existingPlansByMaterial.set(mId, []);
        }
        existingPlansByMaterial.get(mId)!.push({
          planId: Number(plan.PlanID),
          planDate: this.toIsoDate(plan.PlanDate),
          poNumber: plan.PONumber ? plan.PONumber.trim() : null,
          supplierId: plan.SupplierID ? Number(plan.SupplierID) : undefined,
          planQtyKg: Number(plan.PlanQtyKg || 0),
        });
      }

      // NHÁNH 1: Mô phỏng gom chuyến xe tải (JRP Consolidation)
      if (dto.consolidateBySupplier) {
        const consolidationInputItems: ConsolidationInputItem[] = rawItems.map((r: any) => {
          const mId = Number(r.MaterialID);
          const isBulk =
            String(r.Category || '').toUpperCase() === 'BULK' ||
            String(r.ItemGroup || '').toUpperCase() === 'BULK';
          return {
            materialId: mId,
            materialCode: r.MaterialCode,
            materialName: r.MaterialName,
            supplierId: Number(r.SupplierID),
            supplierCode: r.SupplierCode,
            supplierName: r.SupplierName,
            bagKg: r.BagKg != null ? Number(r.BagKg) : 25,
            isBulk,
            stdDailyKg: Number(r.DailyDemandKg || 0),
            currentStockKg: Number(r.CurrentSohKg || 0),
            safetyDays: Number(r.SafetyDays || 7),
            warningDays: Number(r.WarningDays || 15),
            openPos: (posByMaterial.get(mId) || []).map((p) => ({
              poNumber: p.poNumber,
              remainQtyKg: p.deliverRemainderKg,
              etaDate: p.deliveryDate,
            })),
            existingPlans: (existingPlansByMaterial.get(mId) || []).map((p) => ({
              planDate: p.planDate,
              planQtyKg: p.planQtyKg,
            })),
          };
        });

        const consolidationResult = runConsolidationEngine(
          dto.weekStartDate,
          dto.factoryId,
          consolidationInputItems,
        );

        const suggestedPlans: any[] = [];
        for (const trip of consolidationResult.trips) {
          for (const item of trip.items) {
            suggestedPlans.push({
              isSuggested: true,
              tripId: trip.tripId,
              truckloadTier: trip.truckloadTier,
              fillRatePct: trip.fillRatePct,
              planDate: trip.planDate,
              factoryId: dto.factoryId,
              materialId: item.materialId,
              materialCode: item.materialCode,
              materialName: item.materialName,
              supplierId: trip.supplierId,
              supplierCode: trip.supplierCode,
              supplierName: trip.supplierName,
              poNumber: item.poNumber,
              planQtyKg: item.planQtyKg,
              planQtyTons: item.planQtyTons,
              bagCount: item.bagCount,
              isMustOrder: item.isMustOrder,
              note: `[Xe ${trip.truckloadTier} đầy ${trip.fillRatePct}%] ${item.reason}`,
            });
          }
        }

        return {
          weekStartDate: dto.weekStartDate,
          weekEndDate,
          factoryId: dto.factoryId,
          factoryCode: factoryMeta.FactoryCode,
          factoryName: factoryMeta.FactoryName,
          consolidated: true,
          summary: {
            totalTrips: consolidationResult.totalTrips,
            totalVolumeKg: consolidationResult.totalVolumeKg,
            totalVolumeTons: consolidationResult.totalVolumeTons,
            averageFillRatePct: consolidationResult.averageFillRatePct,
            tripsSavedCount: consolidationResult.tripsSavedCount,
          },
          costAnalysis: consolidationResult.costAnalysis,
          trips: consolidationResult.trips,
          suggestedPlans,
        };
      }

      // NHÁNH 2: Luồng cốt lõi theo Q-051 & BR-36b: Đề xuất độc lập từng cặp cho mọi vật tư trong bộ lọc
      const suggestedPlans: any[] = [];

      for (const item of rawItems) {
        const mId = Number(item.MaterialID);
        const itemOpenPos = posByMaterial.get(mId) || [];
        const itemExistingPlans = existingPlansByMaterial.get(mId) || [];

        const pairResult = suggestDeliveriesForPair({
          snapshotDate: factoryMeta.LatestSnapshotDate || dto.weekStartDate,
          initialStockKg: Number(item.CurrentSohKg || 0),
          dailyDemandKg: Number(item.DailyDemandKg || 0),
          safetyDays: Number(item.SafetyDays || 7),
          criticalDays: 7,
          horizonStartDate: dto.weekStartDate,
          horizonEndDate: weekEndDate,
          bagKg: item.BagKg != null ? Number(item.BagKg) : 25,
          category: item.Category || '',
          itemGroup: item.ItemGroup || '',
          deliveryDaysPair: item.DeliveryDays ? Number(item.DeliveryDays) : undefined,
          deliveryQtyKgPair: item.DeliveryQtyKg ? Number(item.DeliveryQtyKg) : undefined,
          existingPlans: itemExistingPlans,
          transferOrders: [],
          openPos: itemOpenPos,
        });

        for (const sug of pairResult.suggestions) {
          suggestedPlans.push({
            isSuggested: true,
            planDate: sug.suggestDate,
            factoryId: dto.factoryId,
            materialId: mId,
            materialCode: item.MaterialCode,
            materialName: item.MaterialName,
            supplierId: sug.supplierId || Number(item.SupplierID),
            supplierCode: sug.supplierCode || item.SupplierCode,
            supplierName: sug.supplierName || item.SupplierName,
            poNumber: sug.poNumber,
            planQtyKg: sug.suggestQtyKg,
            planQtyTons: sug.suggestQtyTons,
            isLateWarning: sug.isLateWarning,
            doiAfterDelivery: sug.doiAfterDelivery,
            note: sug.reason,
          });
        }
      }

      return {
        weekStartDate: dto.weekStartDate,
        weekEndDate,
        factoryId: dto.factoryId,
        factoryCode: factoryMeta.FactoryCode,
        factoryName: factoryMeta.FactoryName,
        consolidated: false,
        suggestedPlans,
      };
    } catch (err) {
      this.handleSqlError(err);
    }
  }
}
