/**
 * Public, presentation-only Level 5 mode catalog (issue #23).
 *
 * Source of truth: `docs/generated/level5-game-mode-characterization.md` in the Level 5 Unity
 * repository (`sweat-this/level5`, audited at commit `42fe2ed468dc1ce1e18722f422ea7c0149aa7837`),
 * an exported snapshot of the authored mode/rule matrix. Correspondence eligibility (used on
 * `/level5/versus`, not here) is cross-checked against
 * `Assets/Scripts/versus/Level5Versus/DefaultCompetitiveRulesets.cs` in the same repository.
 *
 * This is authored display data, not gameplay configuration - deliberately excludes numeric mode
 * IDs, internal object/prefab names, backend IDs, timer values, arena capability masks, runtime
 * compatibility logic, and competitive comparison keys. Descriptions are restrained, factual
 * transformations of the source's rule dimensions (objective/clock/combat/shot rule/markers), not
 * copies of internal prefab copy and not invented mechanics. Category groupings are this
 * frontend's own public curation, not an authored Unity concept.
 */

export interface PublicGameMode {
  readonly name: string;
  readonly description: string;
}

export interface PublicModeCategory {
  readonly id: string;
  readonly title: string;
  readonly modes: readonly PublicGameMode[];
}

export const MODE_CATALOG: readonly PublicModeCategory[] = [
  {
    id: "score-and-skill",
    title: "Score & Skill",
    modes: [
      {
        name: "Total Points",
        description: "Score the most points before time runs out.",
      },
      {
        name: "Total 3 pointers",
        description: "Make the most 3-pointers before time runs out.",
      },
      {
        name: "Total 4 pointers",
        description: "Make the most 4-pointers before time runs out.",
      },
      {
        name: "Total 7 pointers",
        description: "Make the most 7-pointers before time runs out.",
      },
      {
        name: "Total Distance",
        description: "Rack up the most shooting distance before time runs out.",
      },
      {
        name: "Consecutive shots",
        description:
          "String together the longest streak of makes before time runs out.",
      },
      {
        name: "In the Pocket",
        description: "A points-scoring mode against the clock.",
      },
      {
        name: "Points by Distance",
        description:
          "A points-scoring mode against the clock, scored by shot distance.",
      },
    ],
  },
  {
    id: "shot-contests",
    title: "Shot Contests",
    modes: [
      {
        name: "spot up some 3s",
        description:
          "A 3-point marker-clearing contest, played at your own pace.",
      },
      {
        name: "spot up some 4s",
        description:
          "A 4-point marker-clearing contest, played at your own pace.",
      },
      {
        name: "Spot up some 7s",
        description: "A marker-clearing contest against the clock.",
      },
      {
        name: "spot up all",
        description:
          "A 3- and 4-point marker-clearing contest, played at your own pace.",
      },
      {
        name: "3 point Contest",
        description: "A shooting contest built around 3-point markers.",
      },
      {
        name: "4 point contest",
        description: "A shooting contest built around 4-point markers.",
      },
      {
        name: "7 point contest",
        description: "A shooting contest built around 7-point markers.",
      },
      {
        name: "all point contest",
        description:
          "A shooting contest across 3-point, 4-point, and open-range markers.",
      },
    ],
  },
  {
    id: "combat",
    title: "Combat",
    modes: [
      {
        name: "Bash Up Some Nerds",
        description: "Score-based combat against a wave of enemies.",
      },
      {
        name: "Battle Royal",
        description: "Last-player-standing combat.",
      },
      {
        name: "Cage Match",
        description: "Survival combat in a cage-capable arena.",
      },
    ],
  },
  {
    id: "cpu-and-progression",
    title: "CPU & Progression",
    modes: [
      {
        name: "Versus",
        description: "Score-based play against CPU opponents.",
      },
      {
        name: "Beat tha computahs",
        description: "A progression campaign against CPU opponents.",
      },
      {
        name: "Lockdown",
        description:
          "One-on-one scoring against the clock, with a defender in play.",
      },
    ],
  },
  {
    id: "open-play",
    title: "Open Play",
    modes: [
      {
        name: "Arcade mode",
        description: "Casual open-ended play with no time limit.",
      },
      {
        name: "free play",
        description:
          "Unstructured open-ended shooting with no objective or time limit.",
      },
    ],
  },
];
