import { IsEnum, IsOptional } from 'class-validator';
import TicketStatusEnum from '../enums/ticket-status.enum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FilterTicketDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TicketStatusEnum)
  status?: TicketStatusEnum;
}
