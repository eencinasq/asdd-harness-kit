import { Controller, Get } from '@nestjs/common';

import { APP_NAME, APP_VERSION } from '../app.constants.ts';

/** Liveness probe for the HTTP transport. */
@Controller('health')
export class HealthController {
	@Get()
	check() {
		return { status: 'ok', name: APP_NAME, version: APP_VERSION };
	}
}
