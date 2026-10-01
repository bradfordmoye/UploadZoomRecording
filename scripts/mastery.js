#!/usr/bin/env node
// Runs Mondays at 3:00 PM via cron (see scripts/setup-cron.sh).
require('../src/runJob').cli('Mastery');
