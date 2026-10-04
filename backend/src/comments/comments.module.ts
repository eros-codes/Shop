import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';

import { Comment } from './entities/comment.entity';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, User, Product])],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
