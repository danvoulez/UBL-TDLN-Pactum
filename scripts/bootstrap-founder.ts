#!/usr/bin/env npx ts-node
/**
 * BOOTSTRAP FOUNDER SCRIPT
 * 
 * Creates the first Founder of the system with full permissions.
 * Run this once after initial system setup.
 * 
 * Usage:
 *   npx ts-node scripts/bootstrap-founder.ts --name "Dan Voulez" --email "dan@danvoulez.com" --realm "LogLine"
 * 
 * Or via environment variables:
 *   FOUNDER_NAME="Dan Voulez" FOUNDER_EMAIL="dan@danvoulez.com" FOUNDER_REALM="LogLine" npx ts-node scripts/bootstrap-founder.ts
 */

import { bootstrapFounder } from '../antenna/admin.js';
import { createEventStore } from '../core/store/create-event-store.js';

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  let name = process.env.FOUNDER_NAME;
  let email = process.env.FOUNDER_EMAIL;
  let realmName = process.env.FOUNDER_REALM;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      name = args[i + 1];
      i++;
    } else if (args[i] === '--email' && args[i + 1]) {
      email = args[i + 1];
      i++;
    } else if (args[i] === '--realm' && args[i + 1]) {
      realmName = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Bootstrap Founder - Create the first system administrator

Usage:
  npx ts-node scripts/bootstrap-founder.ts [options]

Options:
  --name <name>     Founder's full name (required)
  --email <email>   Founder's email (required)
  --realm <name>    Create a realm with this name (optional)
  --help, -h        Show this help

Environment Variables:
  FOUNDER_NAME      Founder's full name
  FOUNDER_EMAIL     Founder's email
  FOUNDER_REALM     Realm name to create
  DATABASE_URL      PostgreSQL connection string

Example:
  npx ts-node scripts/bootstrap-founder.ts --name "Dan Voulez" --email "dan@danvoulez.com" --realm "LogLine"
      `);
      process.exit(0);
    }
  }
  
  if (!name || !email) {
    console.error('Error: --name and --email are required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }
  
  console.log('\n🚀 Starting Founder Bootstrap...\n');
  
  try {
    // Create event store (uses DATABASE_URL from env if set)
    const eventStore = createEventStore();
    
    // Bootstrap the founder
    const result = await bootstrapFounder({
      name,
      email,
      realmName,
    }, eventStore);
    
    console.log('\n✅ SUCCESS!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Founder ID:    ${result.founderId}`);
    console.log(`Agreement ID:  ${result.founderAgreementId}`);
    if (result.realmId) {
      console.log(`Realm ID:      ${result.realmId}`);
    }
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n🔑 API KEY (save this, it won't be shown again!):\n`);
    console.log(`   ${result.apiKey}`);
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('\nUse this API key in the X-API-Key header to authenticate.');
    console.log('Example:');
    console.log(`  curl -X POST https://api.ubl.agency/chat \\`);
    console.log(`    -H "X-API-Key: ${result.apiKey}" \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"startSession": {"realmId": "${result.realmId || '00000000-0000-0000-0000-000000000000'}"}, "message": {"text": "Hello!"}}'`);
    console.log('\n');
    
    // Close event store connection
    await (eventStore as any).close?.();
    
  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
