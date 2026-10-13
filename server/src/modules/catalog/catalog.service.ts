import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaginationMeta } from '../../common/dto/pagination.dto.js';
import { ProcedureService } from '../../database/procedure.service.js';
import { FactoryQueryDto } from './dto/factory-query.dto.js';
import { MaterialQueryDto } from './dto/material-query.dto.js';
import { PlantItemQueryDto } from './dto/plant-item-query.dto.js';
import { SupplierQueryDto } from './dto/supplier-query.dto.js';
import { UpdateMaterialDto } from './dto/update-material.dto.js';
import { UpdatePlantItemDto } from './dto/update-plant-item.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly procedureService: ProcedureService) {}

  /**
   * Danh sách Nhà máy
   */
  async getFactories(query: FactoryQueryDto): Promise<{ items: any[]; meta: PaginationMeta }> {
    const page = query.page || 1;
    const pageSize = query.parsedPageSize;

    const rows = await this.procedureService.executeProcedure('usp_Master_FactoryList', {
      Search: query.search || null,
      Region: query.region || null,
      IsActive: query.isActive !== undefined ? (query.isActive ? 1 : 0) : null,
      Page: page,
      PageSize: pageSize,
      SortBy: query.sort || 'FactoryCode',
      SortOrder: (query.order || 'ASC').toUpperCase(),
    });

    const totalItems = rows && rows.length > 0 ? Number(rows[0].TotalCount) : 0;
    const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1;

    return {
      items: (rows || []).map((r) => ({
        factoryId: r.FactoryID,
        factoryCode: r.FactoryCode,
        warehouseCode: r.WarehouseCode,
        factoryName: r.FactoryName,
        region: r.Region,
        plantType: r.PlantType,
        isActive: Boolean(r.IsActive),
        createdAt: r.CreatedAt,
        updatedAt: r.UpdatedAt,
      })),
      meta: { page, pageSize: query.pageSize, totalItems, totalPages },
    };
  }

  /**
   * Danh sách Nguyên liệu
   */
  async getMaterials(query: MaterialQueryDto): Promise<{ items: any[]; meta: PaginationMeta }> {
    const page = query.page || 1;
    const pageSize = query.parsedPageSize;

    const rows = await this.procedureService.executeProcedure('usp_Master_MaterialList', {
      Search: query.search || null,
      Category: query.category || null,
      ItemGroup: query.itemGroup || null,
      IsActive: query.isActive !== undefined ? (query.isActive ? 1 : 0) : null,
      Page: page,
      PageSize: pageSize,
      SortBy: query.sort || 'MaterialCode',
      SortOrder: (query.order || 'ASC').toUpperCase(),
    });

    const totalItems = rows && rows.length > 0 ? Number(rows[0].TotalCount) : 0;
    const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1;

    return {
      items: (rows || []).map((r) => ({
        materialId: r.MaterialID,
        materialCode: r.MaterialCode,
        materialName: r.MaterialName,
        category: r.Category,
        itemGroup: r.ItemGroup,
        packingSpec: r.PackingSpec,
        bagKg: r.BagKg ? Number(r.BagKg) : null,
        uom: r.UOM,
        itemType: r.ItemType,
        pic: r.PIC,
        displayDecimals: Number(r.DisplayDecimals),
        isActive: Boolean(r.IsActive),
        createdAt: r.CreatedAt,
        updatedAt: r.UpdatedAt,
      })),
      meta: { page, pageSize: query.pageSize, totalItems, totalPages },
    };
  }

  /**
   * Danh sách Nhà cung cấp
   */
  async getSuppliers(query: SupplierQueryDto): Promise<{ items: any[]; meta: PaginationMeta }> {
    const page = query.page || 1;
    const pageSize = query.parsedPageSize;

    const rows = await this.procedureService.executeProcedure('usp_Master_SupplierList', {
      Search: query.search || null,
      VendorGroup: query.vendorGroup || null,
      IsActive: query.isActive !== undefined ? (query.isActive ? 1 : 0) : null,
      Page: page,
      PageSize: pageSize,
      SortBy: query.sort || 'SupplierCode',
      SortOrder: (query.order || 'ASC').toUpperCase(),
    });

    const totalItems = rows && rows.length > 0 ? Number(rows[0].TotalCount) : 0;
    const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1;

    return {
      items: (rows || []).map((r) => ({
        supplierId: r.SupplierID,
        supplierCode: r.SupplierCode,
        supplierName: r.SupplierName,
        vendorGroup: r.VendorGroup,
        country: r.Country,
        leadTimeDays: Number(r.LeadTimeDays),
        isActive: Boolean(r.IsActive),
        createdAt: r.CreatedAt,
        updatedAt: r.UpdatedAt,
      })),
      meta: { page, pageSize: query.pageSize, totalItems, totalPages },
    };
  }

  /**
   * Danh sách Cặp theo dõi Nhà máy - Nguyên liệu
   */
  async getPlantItems(query: PlantItemQueryDto): Promise<{ items: any[]; meta: PaginationMeta }> {
    const page = query.page || 1;
    const pageSize = query.parsedPageSize;

    const rows = await this.procedureService.executeProcedure('usp_Master_PlantItemList', {
      Search: query.search || null,
      FactoryID: query.factoryId || null,
      Category: query.category || null,
      IsTracked: query.isTracked !== undefined ? (query.isTracked ? 1 : 0) : null,
      IsActive: query.isActive !== undefined ? (query.isActive ? 1 : 0) : null,
      Page: page,
      PageSize: pageSize,
      SortBy: query.sort || 'PairID',
      SortOrder: (query.order || 'ASC').toUpperCase(),
    });

    const totalItems = rows && rows.length > 0 ? Number(rows[0].TotalCount) : 0;
    const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1;

    return {
      items: (rows || []).map((r) => ({
        pairId: r.PairID,
        factoryId: r.FactoryID,
        factoryCode: r.FactoryCode,
        factoryName: r.FactoryName,
        materialId: r.MaterialID,
        materialCode: r.MaterialCode,
        materialName: r.MaterialName,
        category: r.Category,
        itemGroup: r.ItemGroup,
        uom: r.UOM,
        displayDecimals: Number(r.DisplayDecimals),
        isTracked: Boolean(r.IsTracked),
        isActive: Boolean(r.IsActive),
        createdAt: r.CreatedAt,
        updatedAt: r.UpdatedAt,
      })),
      meta: { page, pageSize: query.pageSize, totalItems, totalPages },
    };
  }

  /**
   * Cập nhật thuộc tính Nguyên liệu (PIC, DisplayDecimals)
   */
  async updateMaterial(
    materialId: number,
    dto: UpdateMaterialDto,
    username: string = 'admin',
    ip: string = '127.0.0.1',
  ): Promise<any> {
    try {
      const rows = await this.procedureService.executeProcedure('usp_Master_UpdateMaterial', {
        MaterialID: materialId,
        PIC: dto.pic || null,
        DisplayDecimals: dto.displayDecimals,
        UpdatedBy: username,
      });

      if (!rows || rows.length === 0) {
        throw new NotFoundException(`Không tìm thấy nguyên liệu có ID ${materialId}`);
      }

      await this.logAudit(
        null,
        username,
        'MATERIAL_UPDATE',
        'dim_Material',
        materialId.toString(),
        ip,
        'SUCCESS',
        null,
        null,
        JSON.stringify(dto),
      );

      const r = rows[0];
      return {
        materialId: r.MaterialID,
        materialCode: r.MaterialCode,
        materialName: r.MaterialName,
        pic: r.PIC,
        displayDecimals: Number(r.DisplayDecimals),
        updatedAt: r.UpdatedAt,
      };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException(err.message || 'Lỗi khi cập nhật nguyên liệu');
    }
  }

  /**
   * Cập nhật thời gian giao hàng Nhà cung cấp (LeadTimeDays)
   */
  async updateSupplier(
    supplierId: number,
    dto: UpdateSupplierDto,
    username: string = 'admin',
    ip: string = '127.0.0.1',
  ): Promise<any> {
    try {
      const rows = await this.procedureService.executeProcedure('usp_Master_UpdateSupplier', {
        SupplierID: supplierId,
        LeadTimeDays: dto.leadTimeDays,
        UpdatedBy: username,
      });

      if (!rows || rows.length === 0) {
        throw new NotFoundException(`Không tìm thấy nhà cung cấp có ID ${supplierId}`);
      }

      await this.logAudit(
        null,
        username,
        'SUPPLIER_UPDATE',
        'dim_Supplier',
        supplierId.toString(),
        ip,
        'SUCCESS',
        null,
        null,
        JSON.stringify(dto),
      );

      const r = rows[0];
      return {
        supplierId: r.SupplierID,
        supplierCode: r.SupplierCode,
        supplierName: r.SupplierName,
        leadTimeDays: Number(r.LeadTimeDays),
        updatedAt: r.UpdatedAt,
      };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException(err.message || 'Lỗi khi cập nhật nhà cung cấp');
    }
  }

  /**
   * Bật/Tắt theo dõi Cặp Nhà máy - Nguyên liệu (IsTracked)
   */
  async updatePlantItem(
    pairId: number,
    dto: UpdatePlantItemDto,
    username: string = 'admin',
    ip: string = '127.0.0.1',
  ): Promise<any> {
    try {
      const rows = await this.procedureService.executeProcedure('usp_Master_UpdatePlantItem', {
        PairID: pairId,
        IsTracked: dto.isTracked ? 1 : 0,
        UpdatedBy: username,
      });

      if (!rows || rows.length === 0) {
        throw new NotFoundException(`Không tìm thấy cặp có ID ${pairId}`);
      }

      await this.logAudit(
        null,
        username,
        'PLANT_ITEM_UPDATE',
        'dim_Factory_Material',
        pairId.toString(),
        ip,
        'SUCCESS',
        null,
        null,
        JSON.stringify(dto),
      );

      const r = rows[0];
      return {
        pairId: r.PairID,
        factoryId: r.FactoryID,
        factoryCode: r.FactoryCode,
        materialId: r.MaterialID,
        materialCode: r.MaterialCode,
        isTracked: Boolean(r.IsTracked),
        updatedAt: r.UpdatedAt,
      };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException(err.message || 'Lỗi khi cập nhật trạng thái theo dõi cặp');
    }
  }

  /**
   * Dropdown danh mục dùng chung toàn ứng dụng (A5: Mở cho mọi user đã login)
   */
  async getDropdowns(): Promise<{
    factories: any[];
    materials: any[];
    suppliers: any[];
    categories: string[];
  }> {
    const resultSets = await this.procedureService.executeMultiSetProcedure('usp_Master_Dropdowns');

    const factories = (resultSets[0] || []).map((f: any) => ({
      factoryId: f.FactoryID,
      factoryCode: f.FactoryCode,
      factoryName: f.FactoryName,
      warehouseCode: f.WarehouseCode,
      region: f.Region,
    }));

    const materials = (resultSets[1] || []).map((m: any) => ({
      materialId: m.MaterialID,
      materialCode: m.MaterialCode,
      materialName: m.MaterialName,
      category: m.Category,
      itemGroup: m.ItemGroup,
      uom: m.UOM,
      displayDecimals: Number(m.DisplayDecimals),
    }));

    const suppliers = (resultSets[2] || []).map((s: any) => ({
      supplierId: s.SupplierID,
      supplierCode: s.SupplierCode,
      supplierName: s.SupplierName,
      vendorGroup: s.VendorGroup,
      leadTimeDays: Number(s.LeadTimeDays),
    }));

    const categories = (resultSets[3] || []).map((c: any) => c.Category);

    return {
      factories,
      materials,
      suppliers,
      categories,
    };
  }

  /**
   * Ghi log kiểm toán
   */
  private async logAudit(
    userId: number | null,
    username: string,
    actionCode: string,
    targetEntity: string,
    targetId: string | null = null,
    ip: string = '127.0.0.1',
    status: 'SUCCESS' | 'FAILED' = 'SUCCESS',
    errorMessage: string | null = null,
    oldValues: string | null = null,
    newValues: string | null = null,
  ): Promise<void> {
    try {
      await this.procedureService.executeProcedure('usp_Audit_Write', {
        UserID: userId,
        Username: username,
        ActionCode: actionCode,
        TargetEntity: targetEntity,
        TargetID: targetId,
        IPAddress: ip,
        OldValues: oldValues,
        NewValues: newValues,
        Status: status,
        ErrorMessage: errorMessage,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to write audit log: ${e.message}`);
    }
  }
}
