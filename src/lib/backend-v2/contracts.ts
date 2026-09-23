/**
 * The only place allowed to write `components["schemas"][...]` generated-schema syntax. Every
 * other module imports the named aliases below instead - see issue #4: generated types are the
 * authority for wire shape, but that syntax must not spread throughout the codebase.
 *
 * Pure type re-exports - safe to import from Client Components too (see transport.ts and the
 * resource clients under ./resources for the server-only runtime pieces).
 */
import type { components } from "@/generated/level5-v2";

/**
 * Strips generated-schema optionality and recurses into nested objects/arrays, without changing
 * an intentional `| null` union (e.g. SeriesSummaryPage.nextCursor). openapi-typescript marks
 * every property optional by default - see contracts/README.md - but Backend V2's DTOs are
 * plain records that always serialize every property, so the wire shape is more precise than
 * the generated type admits.
 */
type DeepRequired<T> = T extends readonly (infer U)[]
  ? DeepRequired<U>[]
  : T extends object
    ? { [K in keyof T]-?: DeepRequired<T[K]> }
    : T;

export type BackendCredentials = DeepRequired<
  components["schemas"]["AccessTokenResponseDto"]
>;
export type CurrentAccount = DeepRequired<
  components["schemas"]["CurrentAccountResponseDto"]
>;
export type PlayerProfile = DeepRequired<
  components["schemas"]["PlayerProfileResponseDto"]
>;
export type PublicPlayerSummary = DeepRequired<
  components["schemas"]["PublicPlayerSummaryDto"]
>;
export type FriendSummary = DeepRequired<
  components["schemas"]["FriendSummaryDto"]
>;
export type FriendRequestSummary = DeepRequired<
  components["schemas"]["FriendRequestResponseDto"]
>;
export type FriendRequestListItem = DeepRequired<
  components["schemas"]["FriendRequestListItemDto"]
>;
export type SeriesResponse = DeepRequired<
  components["schemas"]["SeriesResponseDto"]
>;
export type SeriesSummary = DeepRequired<
  components["schemas"]["SeriesSummaryDto"]
>;
export type SeriesSummaryPage = DeepRequired<
  components["schemas"]["SeriesSummaryPageDto"]
>;
export type SeriesDetails = DeepRequired<
  components["schemas"]["SeriesDetailResponseDto"]
>;
