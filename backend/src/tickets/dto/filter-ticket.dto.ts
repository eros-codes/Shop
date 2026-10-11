import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import TicketStatusEnum from '../enums/ticket-status.enum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FilterTicketDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TicketStatusEnum)
  status?: TicketStatusEnum;

  // A ticket number, words from its title or (for staff) the customer's
  // name or mobile. The panel used to search only the page on screen.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;
}
