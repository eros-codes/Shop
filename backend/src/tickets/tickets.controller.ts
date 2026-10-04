import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { FilterTicketDto } from './dto/filter-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard)
@ApiTags('Support tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  async create(
    @Body() createTicketDto: CreateTicketDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const newTicket = await this.ticketsService.create(
      currentUser.userId,
      createTicketDto,
      currentUser.role === userRoleEnum.AdminUser,
    );
    return { data: newTicket, message: 'Ticket Created Successfully' };
  }

  @Get()
  async findAll(
    @Query() query: FilterTicketDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    const tickets = await this.ticketsService.findAll(
      currentUser.userId,
      query,
      isAdmin,
    );
    return { data: tickets, message: 'Tickets Found' };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const ticket = await this.ticketsService.findOne(id);
    const isOwner = ticket.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only view your own tickets');
    }
    return { data: ticket, message: 'Ticket Found' };
  }

  @Get(':id/replies')
  async findReplies(
    @Param('id', ParseIdPipe) id: number,
    @Query() query: PaginationQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const ticket = await this.ticketsService.findOne(id);
    const isOwner = ticket.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only view your own tickets');
    }
    const replies = await this.ticketsService.findReplies(id, query);
    return { data: replies, message: 'Replies Found' };
  }

  @UseGuards(RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateTicketDto: UpdateTicketDto,
  ) {
    const updatedTicket = await this.ticketsService.update(id, updateTicketDto);
    return { data: updatedTicket, message: 'Ticket Updated Successfully' };
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const existing = await this.ticketsService.findOne(id);
    const isOwner = existing.user.id === currentUser.userId;
    const isAdmin = currentUser.role === userRoleEnum.AdminUser;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only delete your own tickets');
    }
    await this.ticketsService.remove(id);
    return { message: 'Ticket Deleted Successfully' };
  }
}
