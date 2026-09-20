import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // CLAUDE.md is the project brief, hand-written and checked in. `next dev`
  // otherwise appends its own agent-rules block to it on every run.
  agentRules: false,

  // The dev badge overlaps the primary button at 390px, which makes every
  // review screenshot misleading.
  devIndicators: false,
};

export default nextConfig;
