import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import {
  LowStockDto,
  SalesReportDto,
  TopProductsDto,
} from './dto/report-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import { ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(userRoleEnum.AdminUser)
@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  async summary() {
    return { data: await this.reportsService.summary(), message: 'Summary' };
  }

  @Get('sales')
  async sales(@Query() query: SalesReportDto) {
    return {
      data: await this.reportsService.sales(query),
      message: 'Sales Report',
    };
  }

  @Get('top-products')
  async topProducts(@Query() query: TopProductsDto) {
    return {
      data: await this.reportsService.topProducts(query),
      message: 'Top Products',
    };
  }

  @Get('low-stock')
  async lowStock(@Query() query: LowStockDto) {
    return {
      data: await this.reportsService.lowStock(query),
      message: 'Low Stock',
    };
  }
}
