# Team Decisions Log

**Last Updated:** 2026-04-09T08:43:25Z

## Architecture

### Squad Cast Extraction (Amos + Naomi)
- **Decision:** Extract and render squad cast members from session event descriptions and prompts
- **Pattern A:** Description format: `🔧 Amos: Refactoring auth`
- **Pattern B:** Prompt format: `You are Amos, the Backend Dev on this project`
- **Why:** Provide session visibility into which team members contributed to each session
- **Integration:** 
  - Backend: SquadCastMember type in src/types/index.ts
  - Mapper: sessionMapper.ts wires extraction in sessionMapper service
  - Frontend: SquadCastList component renders cast in SessionDetail
  - UI: Emoji + role badges with squad logo

## Testing
- squadCastExtractor: 11 unit tests passing
- All TypeScript clean (no errors)

## Open Items
- None
