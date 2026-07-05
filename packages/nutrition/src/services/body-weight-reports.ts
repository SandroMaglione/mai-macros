import { Array, Context, Data, Effect, Layer, Schema } from "effect";

import { DateKey, type BodyWeightEntry } from "../domain.ts";
import { NutritionStore } from "./store.ts";

const _GetBodyWeightReportRangeInput = Schema.Struct({
  endDateKey: DateKey,
  startDateKey: DateKey,
});

export type GetBodyWeightReportRangeInput =
  typeof _GetBodyWeightReportRangeInput.Encoded;

export type BodyWeightReportPoint = {
  readonly dateKey: DateKey;
  readonly weightKilograms: number;
};

export type BodyWeightReportOutlier = {
  readonly entry: BodyWeightEntry;
  readonly residualKilograms: number;
};

export type BodyWeightReportInsight = {
  readonly id: string;
  readonly text: string;
  readonly tone: "neutral" | "positive" | "warning";
};

export type BodyWeightReportRange = {
  readonly cleanedEntries: readonly BodyWeightEntry[];
  readonly endDateKey: DateKey;
  readonly entries: readonly BodyWeightEntry[];
  readonly insights: readonly BodyWeightReportInsight[];
  readonly latestEntry: BodyWeightEntry | null;
  readonly outliers: readonly BodyWeightReportOutlier[];
  readonly startDateKey: DateKey;
  readonly trendPoints: readonly BodyWeightReportPoint[];
};

export class InvalidBodyWeightReportRange extends Data.TaggedError(
  "InvalidBodyWeightReportRange"
)<{
  readonly endDateKey: DateKey;
  readonly startDateKey: DateKey;
}> {}

const outlierMinimumNeighborCount = 3;
const outlierWindowDays = 10;
const outlierMinimumResidualKilograms = 2.5;
const trendHalfLifeDays = 7;

export class BodyWeightReports extends Context.Service<BodyWeightReports>()(
  "BodyWeightReports",
  {
    make: Effect.gen(function* () {
      const store = yield* NutritionStore;

      return {
        getRange: Effect.fn("BodyWeightReports.getRange")(function* ({
          input,
        }: {
          readonly input: GetBodyWeightReportRangeInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _GetBodyWeightReportRangeInput
          )(input);

          if (decodedInput.startDateKey > decodedInput.endDateKey) {
            return yield* new InvalidBodyWeightReportRange({
              endDateKey: decodedInput.endDateKey,
              startDateKey: decodedInput.startDateKey,
            });
          }

          const entries = [
            ...(yield* store.findBodyWeightEntriesByRange(decodedInput)),
          ].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
          const outliers = entries.flatMap((entry) => {
            const entryDay = _dateKeyToDayIndex({ dateKey: entry.dateKey });
            const neighbors = entries.filter((candidate) => {
              if (candidate.dateKey === entry.dateKey) {
                return false;
              }

              return (
                Math.abs(
                  _dateKeyToDayIndex({ dateKey: candidate.dateKey }) - entryDay
                ) <= outlierWindowDays
              );
            });

            if (neighbors.length < outlierMinimumNeighborCount) {
              return [];
            }

            const neighborWeights = neighbors.map(
              (candidate) => candidate.weightKilograms
            );
            const median = _median(neighborWeights);
            const medianAbsoluteDeviation = _median(
              neighborWeights.map((weightKilograms) =>
                Math.abs(weightKilograms - median)
              )
            );
            const residualKilograms = Math.abs(entry.weightKilograms - median);
            const threshold = Math.max(
              outlierMinimumResidualKilograms,
              medianAbsoluteDeviation * 1.4826 * 3
            );

            return residualKilograms > threshold
              ? [
                  {
                    entry,
                    residualKilograms,
                  },
                ]
              : [];
          });
          const outlierDateKeys = outliers.map(
            (outlier) => outlier.entry.dateKey
          );
          const cleanedEntries = entries.filter(
            (entry) => !outlierDateKeys.includes(entry.dateKey)
          );
          const trendEntries =
            cleanedEntries[1] !== undefined ||
            !Array.isReadonlyArrayNonEmpty(entries)
              ? cleanedEntries
              : entries;
          const trendPoints = trendEntries.reduce<
            readonly BodyWeightReportPoint[]
          >((points, entry) => {
            const previousPoint = points.at(-1);

            if (previousPoint === undefined) {
              return [
                {
                  dateKey: entry.dateKey,
                  weightKilograms: entry.weightKilograms,
                },
              ];
            }

            const elapsedDays = Math.max(
              1,
              _dateKeyToDayIndex({ dateKey: entry.dateKey }) -
                _dateKeyToDayIndex({ dateKey: previousPoint.dateKey })
            );
            const alpha =
              1 - Math.exp((-Math.log(2) * elapsedDays) / trendHalfLifeDays);
            const weightKilograms =
              previousPoint.weightKilograms +
              alpha * (entry.weightKilograms - previousPoint.weightKilograms);

            return [
              ...points,
              {
                dateKey: entry.dateKey,
                weightKilograms,
              },
            ];
          }, []);
          const firstPoint = trendPoints[0];
          const lastPoint = trendPoints.at(-1);
          const trendElapsedDays =
            firstPoint === undefined || lastPoint === undefined
              ? null
              : _dateKeyToDayIndex({ dateKey: lastPoint.dateKey }) -
                _dateKeyToDayIndex({ dateKey: firstPoint.dateKey });
          const trendChangeKilograms =
            firstPoint === undefined || lastPoint === undefined
              ? 0
              : lastPoint.weightKilograms - firstPoint.weightKilograms;
          const trendDirection =
            trendChangeKilograms > 0.05
              ? "up"
              : trendChangeKilograms < -0.05
                ? "down"
                : "flat";
          const trendInsight: BodyWeightReportInsight | null =
            trendElapsedDays === null || trendElapsedDays <= 0
              ? null
              : {
                  id: "trend",
                  text:
                    trendDirection === "flat"
                      ? `Your weighted trend is flat over ${trendElapsedDays} days.`
                      : `Your weighted trend is ${trendDirection} ${_formatKilograms(
                          {
                            value: Math.abs(trendChangeKilograms),
                          }
                        )} over ${trendElapsedDays} days.`,
                  tone:
                    trendDirection === "up"
                      ? "warning"
                      : trendDirection === "down"
                        ? "positive"
                        : "neutral",
                };
          const movement = trendPoints.reduce<{
            readonly end: BodyWeightReportPoint;
            readonly start: BodyWeightReportPoint;
          } | null>((current, startPoint, startIndex) => {
            const candidates = trendPoints
              .slice(startIndex + 1)
              .filter((endPoint) => {
                const elapsedDays =
                  _dateKeyToDayIndex({ dateKey: endPoint.dateKey }) -
                  _dateKeyToDayIndex({ dateKey: startPoint.dateKey });

                return elapsedDays >= 3;
              });
            const bestCandidate = candidates.reduce<{
              readonly end: BodyWeightReportPoint;
              readonly start: BodyWeightReportPoint;
            } | null>((candidateCurrent, endPoint) => {
              const candidate = {
                end: endPoint,
                start: startPoint,
              };

              return _absoluteMovement(candidate) >
                _absoluteMovement(candidateCurrent)
                ? candidate
                : candidateCurrent;
            }, current);

            return _absoluteMovement(bestCandidate) > _absoluteMovement(current)
              ? bestCandidate
              : current;
          }, null);
          const movementChangeKilograms =
            movement === null
              ? 0
              : movement.end.weightKilograms - movement.start.weightKilograms;
          const movementDirection = movementChangeKilograms > 0 ? "up" : "down";
          const movementInsight: BodyWeightReportInsight | null =
            movement === null || _absoluteMovement(movement) < 0.5
              ? null
              : {
                  id: "movement",
                  text: `The largest trend shift moved ${movementDirection} ${_formatKilograms(
                    {
                      value: Math.abs(movementChangeKilograms),
                    }
                  )} from ${movement.start.dateKey} to ${movement.end.dateKey}.`,
                  tone: movementDirection === "up" ? "warning" : "positive",
                };
          const weekdayResiduals: Record<string, readonly number[]> =
            entries.length < 8 || trendPoints.length < 2
              ? {}
              : entries.reduce<Record<string, readonly number[]>>(
                  (groups, entry) => {
                    const trendPoint = trendPoints.find(
                      (point) => point.dateKey === entry.dateKey
                    );

                    if (trendPoint === undefined) {
                      return groups;
                    }

                    const [yearString, monthString, dayString] =
                      entry.dateKey.split("-");
                    const year = Number(yearString);
                    const month = Number(monthString);
                    const day = Number(dayString);
                    const date = new Date(Date.UTC(year, month - 1, day, 12));
                    const weekday = new Intl.DateTimeFormat("en-US", {
                      weekday: "long",
                    }).format(date);

                    return {
                      ...groups,
                      [weekday]: [
                        ...(groups[weekday] ?? []),
                        entry.weightKilograms - trendPoint.weightKilograms,
                      ],
                    };
                  },
                  {}
                );
          const weekdayAverages = Object.entries(weekdayResiduals)
            .filter(([, residuals]) => residuals.length >= 2)
            .map(([weekday, residuals]) => ({
              residualKilograms:
                residuals.reduce((total, residual) => total + residual, 0) /
                residuals.length,
              weekday,
            }))
            .sort(
              (left, right) =>
                Math.abs(right.residualKilograms) -
                Math.abs(left.residualKilograms)
            );
          const strongestWeekday = weekdayAverages[0];
          const weekdayInsight: BodyWeightReportInsight | null =
            entries.length < 8 ||
            trendPoints.length < 2 ||
            strongestWeekday === undefined ||
            Math.abs(strongestWeekday.residualKilograms) < 0.3
              ? null
              : {
                  id: "weekday",
                  text: `${strongestWeekday.weekday} entries average ${_formatKilograms(
                    {
                      value: Math.abs(strongestWeekday.residualKilograms),
                    }
                  )} ${
                    strongestWeekday.residualKilograms > 0 ? "above" : "below"
                  } your trend.`,
                  tone: "neutral",
                };
          const outlierInsight: BodyWeightReportInsight | null =
            !Array.isReadonlyArrayNonEmpty(outliers)
              ? null
              : {
                  id: "outliers",
                  text:
                    outliers.length === 1
                      ? "1 weight entry looks unusual and is excluded from the trend line."
                      : `${outliers.length} weight entries look unusual and are excluded from the trend line.`,
                  tone: "warning",
                };
          const insights = [
            trendInsight,
            movementInsight,
            weekdayInsight,
            outlierInsight,
          ].flatMap((insight) => (insight === null ? [] : [insight]));

          return {
            cleanedEntries,
            endDateKey: decodedInput.endDateKey,
            entries,
            insights,
            latestEntry: entries.at(-1) ?? null,
            outliers,
            startDateKey: decodedInput.startDateKey,
            trendPoints,
          } satisfies BodyWeightReportRange;
        }),
      };
    }),
  }
) {
  static readonly layer = Layer.effect(this)(this.make);
}

function _absoluteMovement(
  movement: {
    readonly end: BodyWeightReportPoint;
    readonly start: BodyWeightReportPoint;
  } | null
) {
  return movement === null
    ? 0
    : Math.abs(movement.end.weightKilograms - movement.start.weightKilograms);
}

function _median(values: readonly number[]) {
  if (!Array.isReadonlyArrayNonEmpty(values)) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);
  const middleValue = sortedValues[middleIndex] ?? 0;

  return sortedValues.length % 2 === 1
    ? middleValue
    : ((sortedValues[middleIndex - 1] ?? middleValue) + middleValue) / 2;
}

function _dateKeyToDayIndex({ dateKey }: { readonly dateKey: DateKey }) {
  const [yearString, monthString, dayString] = dateKey.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  return Math.floor(Date.UTC(year, month - 1, day, 12) / 86_400_000);
}

function _formatKilograms({ value }: { readonly value: number }) {
  return `${value.toFixed(value < 10 ? 1 : 0)} kg`;
}
