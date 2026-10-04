import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  ANONYMOUS_VIEWER,
  CommentsService,
  CommentViewer,
} from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { UpdateCommentStatusDto } from './dto/update-comment-status.dto';
import { FilterCommentDto } from './dto/filter-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import userRoleEnum from '../users/enums/userRoleEnum';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ApiTags } from '@nestjs/swagger';

function toViewer(user: CurrentUserPayload | null | undefined): CommentViewer {
  return user
    ? { userId: user.userId, isAdmin: user.role === userRoleEnum.AdminUser }
    : ANONYMOUS_VIEWER;
}

@ApiTags('Comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async findAll(
    @Query() query: FilterCommentDto,
    @CurrentUser() currentUser: CurrentUserPayload | null,
  ) {
    const comments = await this.commentsService.findAll(
      query,
      toViewer(currentUser),
    );
    return { data: comments, message: 'Comments found' };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/replies')
  async findReplies(
    @Param('id', ParseIdPipe) id: number,
    @Query() query: PaginationQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload | null,
  ) {
    const replies = await this.commentsService.findReplies(
      id,
      query,
      toViewer(currentUser),
    );
    return { data: replies, message: 'Replies found' };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async findOne(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload | null,
  ) {
    const comment = await this.commentsService.findOne(
      id,
      toViewer(currentUser),
    );
    return { data: comment, message: 'Comment found' };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const comment = await this.commentsService.create(
      currentUser.userId,
      createCommentDto,
    );
    return { data: comment, message: 'Comment created successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateCommentDto: UpdateCommentDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    const comment = await this.commentsService.update(
      id,
      currentUser.userId,
      updateCommentDto,
    );
    return { data: comment, message: 'Comment updated successfully' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(userRoleEnum.AdminUser)
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIdPipe) id: number,
    @Body() updateCommentStatusDto: UpdateCommentStatusDto,
  ) {
    const comment = await this.commentsService.updateStatus(
      id,
      updateCommentStatusDto,
    );
    return { data: comment, message: 'Comment status updated successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    await this.commentsService.remove(id, toViewer(currentUser));
    return { message: 'Comment deleted successfully' };
  }
}
