import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { TableroDelPiloto } from '@repunto/contratos';

import { GuardDeAdmin } from './admin.guard';
import { TableroDeAdminService } from './tablero.service';

@Controller('admin/tablero')
@UseGuards(GuardDeAdmin)
export class TableroDeAdminController {
  constructor(
    @Inject(TableroDeAdminService) private readonly tablero: TableroDeAdminService,
  ) {}

  @Get()
  ver(): Promise<TableroDelPiloto> {
    return this.tablero.tablero();
  }
}
