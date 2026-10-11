import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CreateBookmarkDto } from './create-bookmark.dto';

// One basket line, and how many units to add or take away. Without a
// quantity it is one unit, as before. The storefront used to send one
// request per unit - five of an item was five round trips on a phone
// connection, and a failure half way left the basket half changed.
export class BasketItemDto extends CreateBookmarkDto {
  @IsOptional()
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(1000, { message: 'quantity must be at most 1000' })
  quantity?: number;
}
