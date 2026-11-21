import { Logger } from '@nestjs/common';

const logger = new Logger('Example');

// ruleid: sec.secret-not-logged
console.log(`using key ${process.env.KNOWLEDGE_EMBEDDINGS_KEY}`);
// ruleid: sec.secret-not-logged
logger.debug('token', process.env.GH_TOKEN);
// ruleid: sec.secret-not-logged
process.stderr.write(`api key: ${process.env.MCP_API_KEY}\n`);
// ok: sec.secret-not-logged
console.log(`embeddings key ${process.env.KNOWLEDGE_EMBEDDINGS_KEY ? 'set' : 'missing'}`);
// ok: sec.secret-not-logged
logger.log(`root ${process.env.HARNESS_ROOT}`);
// ok: sec.secret-not-logged
const headers = { authorization: `Bearer ${process.env.KNOWLEDGE_EMBEDDINGS_KEY}` };
