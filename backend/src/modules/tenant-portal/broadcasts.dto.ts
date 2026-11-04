import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BroadcastPreviewDto {
  @ApiProperty({ type: [String], description: 'Properties whose current tenants get the notice' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  propertyIds!: string[];
}

export class CreateBroadcastDto extends BroadcastPreviewDto {
  @ApiProperty({ minLength: 1, maxLength: 480, example: 'Water off Saturday 9am to noon.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(480)
  text!: string;

  @ApiPropertyOptional({ description: 'Also email tenants who have an email address' })
  @IsOptional()
  @IsBoolean()
  alsoEmail?: boolean;
}
