import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { MAX_INT32 } from '../constants/limits';

@Injectable()
export class ParseIdPipe implements PipeTransform<unknown, number> {
  transform(value: unknown, metadata: ArgumentMetadata): number {
    const id = toId(value);
    if (id === null) {
      throw new BadRequestException(
        `${metadata.data ?? 'id'} must be a positive integer`,
      );
    }
    return id;
  }
}

function toId(value: unknown): number | null {
  let id: number;
  if (typeof value === 'number') {
    id = value;
  } else if (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)) {
    id = Number(value);
  } else {
    return null;
  }
  return Number.isInteger(id) && id >= 1 && id <= MAX_INT32 ? id : null;
}
