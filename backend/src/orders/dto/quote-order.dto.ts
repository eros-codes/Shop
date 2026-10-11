import { PickType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';

// What checkout knows before the customer commits: the basket, where it
// goes, how it ships, a discount code and whether it is paid at the door.
// Wallet or gateway makes no difference to the price, so neither is asked.
export class QuoteOrderDto extends PickType(CreateOrderDto, [
  'addressId',
  'items',
  'discountCode',
  'shippingMethodId',
  'payOnDelivery',
] as const) {}
