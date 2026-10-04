import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { Address } from './entities/address.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
  ) {}

  async create(
    userId: number,
    createAddressDto: CreateAddressDto,
  ): Promise<Address> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException(`User ${userId} Not Found`);
    const address = this.addressRepository.create({
      ...createAddressDto,
      user,
    });
    return this.addressRepository.save(address);
  }

  async findAll(userId: number): Promise<Address[]> {
    return await this.addressRepository.find({
      where: { user: { id: userId } },
      relations: { user: true },
    });
  }

  async findOne(id: number): Promise<Address> {
    const address = await this.addressRepository.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  async update(id: number, updateAddressDto: UpdateAddressDto) {
    const address = await this.findOne(id);
    Object.assign(address, updateAddressDto);
    return await this.addressRepository.save(address);
  }

  async remove(id: number): Promise<void> {
    const address = await this.findOne(id);
    await this.addressRepository.remove(address);
  }
}
