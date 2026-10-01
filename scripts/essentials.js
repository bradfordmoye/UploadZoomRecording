#!/usr/bin/env node
// Runs Tuesdays at 2:00 PM via cron (see scripts/setup-cron.sh).
require('../src/runJob').cli('Essentials');
