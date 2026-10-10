import { IsBooleanString, IsOptional } from 'class-validator';

// ?includeDrafts=true - the admin panel's way of asking for unpublished
// products too. The controller refuses it to anyone but an admin.
export class ProductViewQueryDto {
  @IsOptional()
  @IsBooleanString({ message: 'includeDrafts must be true or false' })
  includeDrafts?: string;
}
