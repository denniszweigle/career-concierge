CREATE TABLE `analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer,
	`jobTitle` text,
	`jobDescription` text NOT NULL,
	`matchScore` real,
	`mismatchScore` real,
	`hardSkillsScore` real,
	`experienceScore` real,
	`domainScore` real,
	`softSkillsScore` real,
	`topStrengths` text,
	`topGaps` text,
	`detailedReport` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`analysisId` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`documentId` integer NOT NULL,
	`chunkIndex` integer NOT NULL,
	`content` text NOT NULL,
	`embedding` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`driveFileId` text NOT NULL,
	`fileName` text NOT NULL,
	`fileType` text NOT NULL,
	`filePath` text NOT NULL,
	`mimeType` text NOT NULL,
	`fileSize` integer,
	`modifiedTime` integer,
	`extractedText` text,
	`isIndexed` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_driveFileId_unique` ON `documents` (`driveFileId`);--> statement-breakpoint
CREATE TABLE `drive_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text,
	`expiresAt` integer NOT NULL,
	`scope` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_tokens_userId_unique` ON `drive_tokens` (`userId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);