import { Module } from '@nestjs/common';

import { ArchitectureScanService } from './architecture/architecture-scan.service.ts';
import { CommentsService } from './comments/comments.service.ts';
import { GithubService } from './github/github.service.ts';
import { PrReviewPrompts } from './pr-review.prompts.ts';
import { PrReviewService } from './pr-review.service.ts';
import { PrReviewTools } from './pr-review.tools.ts';
import { TicketService } from './requirements/ticket.service.ts';
import { ReviewArtifactsRepository } from './workspace/review-artifacts.repository.ts';
import { ReviewWorkspaceService } from './workspace/review-workspace.service.ts';

@Module({
	providers: [
		// MCP entry points
		PrReviewTools,
		PrReviewPrompts,
		// application service (the review workflow)
		PrReviewService,
		// infrastructure
		GithubService,
		ReviewWorkspaceService,
		ReviewArtifactsRepository,
		CommentsService,
		ArchitectureScanService,
		TicketService,
	],
	exports: [PrReviewService],
})
export class PrReviewModule {}
