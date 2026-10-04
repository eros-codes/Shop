import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard)
@ApiTags('Addresses')
@Controller('addresses')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post()
  async create(
    @Body() createAddressDto: CreateAddressDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const newAddress = await this.addressService.create(
      currentUser.userId,
      createAddressDto,
    );
    return { data: newAddress, message: 'Address Created Successfully' };
  }

  @Get()
  async findAll(@CurrentUser() currentUser: CurrentUserPayload) {
    const allAddresses = await this.addressService.findAll(currentUser.userId);
    return { data: allAddresses, message: 'Addresses Found' };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const address = await this.addressService.findOne(id);
    if (address.user.id !== currentUser.userId) {
      throw new ForbiddenException('You can only view your own addresses');
    }
    return { data: address, message: 'Address Found' };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateAddressDto: UpdateAddressDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const existing = await this.addressService.findOne(id);
    if (existing.user.id !== currentUser.userId) {
      throw new ForbiddenException('You can only update your own addresses');
    }
    const updatedAddress = await this.addressService.update(
      id,
      updateAddressDto,
    );
    return { data: updatedAddress, message: 'Address Updated Successfully' };
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const existing = await this.addressService.findOne(id);
    if (existing.user.id !== currentUser.userId) {
      throw new ForbiddenException('You can only delete your own addresses');
    }
    await this.addressService.remove(id);
    return { message: 'Address Deleted Successfully' };
  }
}
