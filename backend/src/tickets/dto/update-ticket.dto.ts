import { IsEnum } from 'class-validator';
import TicketStatusEnum from '../enums/ticket-status.enum';

export class UpdateTicketDto {
  @IsEnum(TicketStatusEnum)
  status!: TicketStatusEnum;
}
