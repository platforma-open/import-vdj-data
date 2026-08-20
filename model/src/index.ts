import type { InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataColumn, createPlDataTableV3 } from "@platforma-sdk/model";
import { blockDataModel } from "./data-model";
import type { BlockArgs, BlockData, ColumnDescription, ColumnProfile } from "./types";
import { bareSetValid } from "./types";

export * from "./types";
export { upgradeLegacyData } from "./data-model";

/**
 * The mapping fields that belong to the dataset door and mean nothing on a bare set: the bare
 * path in the workflow reads `bareSet`, `fileSource` and `datasetRef` and nothing else.
 *
 * Stripping them is not tidiness. A scientist who configures a custom mapping, switches to a
 * bare set and runs would otherwise ship the abandoned mapping to the workflow, where it is
 * dead weight in the args and in every diff a reader of the run later looks at.
 */
function withoutDatasetDoorMapping(args: BlockArgs): BlockArgs {
  return {
    datasetRef: args.datasetRef,
    fileSource: args.fileSource,
    chains: args.chains,
    bareSet: args.bareSet,
  };
}

/**
 * The workflow's view of the block, and the only place validation lives.
 *
 * Three jobs, in order: refuse what cannot run (by throwing), drop the door that is not in
 * use, and drop the fields the chosen path never reads. What it deliberately does NOT do is
 * reorder `chains`: canonicalising a set the user picked in their own order would change the
 * args of every project already on disk, and buys only the rare case of someone re-picking the
 * same chains in a different order.
 */
function projectArgs(data: BlockData): BlockArgs {
  const { datasetRef, format, chains, customMapping, primaryCountType, fileSource } = data;

  // Exactly one door. Both set is a UI bug rather than a choice, and neither means nothing
  // has been picked yet.
  if ((datasetRef === undefined) === (fileSource === undefined)) {
    throw new Error("Select a dataset, or load a file");
  }

  const args: BlockArgs = {
    datasetRef,
    fileSource,
    format,
    chains,
    customMapping,
    primaryCountType,
    bareSet: data.bareSet,
  };

  // The direct door serves the custom format and no other, so the door decides which
  // validation applies. Making the interface set `format` instead was worse than redundant:
  // the value outlived the door, so switching back to a dataset left the whole per-format
  // mapping unfurled under a format nobody had chosen.
  if (fileSource !== undefined) {
    if (!bareSetValid(data.bareSet)) throw new Error("Finish mapping the file's columns");
    return withoutDatasetDoorMapping(args);
  }

  if (format === undefined) throw new Error("Choose a data format");
  if (!Array.isArray(chains) || chains.length === 0) throw new Error("Choose at least one chain");

  if (format === "custom") {
    // A bare set drops the V gene, the J gene and the abundance — it supplies none of them,
    // and the rule that demanded all three could not tell a bare set from a malformed
    // repertoire export. What it requires instead is a sequence mapped to a chain and an
    // identity column, because the key is the identity's hash and the label is its value.
    if (data.bareSet !== undefined) {
      if (!bareSetValid(data.bareSet)) throw new Error("Finish mapping the record's columns");
      return withoutDatasetDoorMapping(args);
    }

    const m = customMapping ?? {};
    const hasSeq = !!m["cdr3-nt"] || !!m["cdr3-aa"];
    const hasV = !!m["v-gene"];
    const hasJ = !!m["j-gene"];
    const pct = primaryCountType ?? "read";
    const hasPrimaryAbundance = pct === "umi" ? !!m["umi-count"] : !!m["read-count"];
    if (!hasSeq || !hasV || !hasJ || !hasPrimaryAbundance) {
      throw new Error("Map a sequence, a V gene, a J gene and an abundance column");
    }
    return args;
  }

  // The per-format flags are written by the UI from the `validationResult` output. They are a
  // mirror of a derivation, which is a hairpin, but replacing them is a separate change: the
  // check they stand for needs the file's headers, and the args lambda cannot reach prerun.
  const presentByFormat: Record<string, boolean> = {
    qiagen: data.qiagenColumnsPresent === true,
    immunoSeq: data.immunoSeqColumnsPresent === true,
    mixcr: data.mixcrColumnsPresent === true,
    "mixcr-sc": data.mixcrColumnsPresent === true,
    cellranger: data.crColumnsPresent === true,
    airr: data.airrColumnsPresent === true,
    "airr-sc": data.airrColumnsPresent === true,
  };
  if (format in presentByFormat && !presentByFormat[format]) {
    throw new Error(`The file does not carry the columns a ${format} dataset needs`);
  }

  return args;
}

// Named `platforma` because the structurer-generated block facade
// (block/src/index.ts) imports that name. Every V3 block uses it too.
export const platforma = BlockModelV3.create(blockDataModel)

  .args<BlockArgs>(projectArgs)

  /**
   * Prerun reads the file's header, infers the mapping and checks the identity column for
   * collisions — discovery, all of it, and all of it expected to be current without the
   * scientist pressing Run. So the projection is deliberately permissive where `args` is
   * strict: it must survive a half-finished mapping, because a half-finished mapping is
   * exactly when the panel needs the headers back.
   *
   * `chains` is absent because prerun never reads it (`workflow/src/prerun.tpl.tengo`).
   */
  .prerunArgs((data) => ({
    datasetRef: data.datasetRef,
    fileSource: data.fileSource,
    format: data.format,
    customMapping: data.customMapping,
    primaryCountType: data.primaryCountType,
    bareSet: data.bareSet,
  }))

  /**
   * Identity values that appear on rows which are not identical to each other.
   *
   * Not `retentive`: this gates the run, so a stale value is worse than a briefly absent one.
   *
   * Read straight from prerun here, and *not* mirrored into `uiState` from a UI watcher. That
   * mirror is what the format-validity flags do, and it is a hairpin — an output written back
   * into state that a derivation then reads. It survives on one client and races on two.
   */
  /**
   * Drives the upload for a directly-loaded file.
   *
   * `getImportProgress()` is what *starts* the transfer — retrieving the progress is the side
   * effect. `isActive` forces the lambda to run even when nobody is looking at the block, and
   * without it the upload never begins, prerun never resolves, and nothing errors anywhere.
   */
  .output(
    "fileImports",
    (ctx) =>
      ctx.outputs
        ?.resolve({ field: "fileImports", allowPermanentAbsence: true })
        ?.getImportProgress(),
    { isActive: true },
  )

  .output(
    "prerunFileImports",
    (ctx) =>
      ctx.prerun
        ?.resolve({ field: "fileImports", allowPermanentAbsence: true })
        ?.getImportProgress(),
    { isActive: true },
  )

  .output("identityCollisions", (ctx) => {
    const raw = ctx.prerun
      ?.resolve({ field: "identityCollisions", allowPermanentAbsence: true })
      ?.getDataAsString();
    if (raw === undefined) return undefined;

    // A one-column TSV: a header, then one colliding value per line.
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return lines.slice(1);
  })

  .retentiveOutput("datasetOptions", (ctx) => {
    return ctx.resultPool.getOptions((v) => {
      const domain = v.domain;
      return (
        v.name === "pl7.app/sequencing/data" &&
        domain !== undefined &&
        (domain["pl7.app/fileExtension"] === "csv" ||
          domain["pl7.app/fileExtension"] === "csv.gz" ||
          domain["pl7.app/fileExtension"] === "tsv" ||
          domain["pl7.app/fileExtension"] === "tsv.gz")
      );
    });
  })

  .retentiveOutput("columnDescriptions", (ctx) => {
    return ctx.prerun
      ?.resolve({
        field: "columnDescriptions",
        allowPermanentAbsence: true,
      })
      ?.getDataAsJson<ColumnDescription[]>();
  })

  /** Every column of a directly-loaded file, profiled over the WHOLE file: its value type, and
   *  whether it holds amino-acid variable domains. Absent on the dataset door, where the pool
   *  supplies the headers instead. */
  .retentiveOutput("columnProfile", (ctx) => {
    const raw = ctx.prerun
      ?.resolve({ field: "columnProfile", allowPermanentAbsence: true })
      ?.getDataAsString();
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as ColumnProfile;
    } catch {
      return undefined;
    }
  })

  /** Headers whose values actually read as amino-acid variable domains. The chain dropdowns
   *  offer only these, so an identifier column cannot be mapped into a sequence slot. Empty
   *  means "not determined" — the UI falls back to every header rather than an empty dropdown. */
  .retentiveOutput("aminoAcidColumns", (ctx) => {
    const raw = ctx.prerun
      ?.resolve({ field: "columnProfile", allowPermanentAbsence: true })
      ?.getDataAsString();
    if (raw === undefined) return undefined;
    try {
      return (JSON.parse(raw) as ColumnProfile).aminoAcid ?? [];
    } catch {
      return undefined;
    }
  })

  /**
   * Headers of the file this block loaded itself. Absent on the dataset door.
   *
   * Separate from {@link datasetColumns} rather than one output answering for both doors. The
   * two are discovered differently — a full profile of a file we hold, versus the pool's own
   * inference over a dataset somebody else produced — and a single output made each door's
   * mapping dropdowns read a value the other door could have written.
   */
  .retentiveOutput("fileColumns", (ctx) => {
    const raw = ctx.prerun
      ?.resolve({ field: "columnProfile", allowPermanentAbsence: true })
      ?.getDataAsString();
    if (raw === undefined) return undefined;
    try {
      return ((JSON.parse(raw) as ColumnProfile).headers ?? []).filter((h) => h.trim().length > 0);
    } catch {
      return undefined;
    }
  })

  /** Headers of the dataset selected from the pool. Absent on the file door. */
  .retentiveOutput("datasetColumns", (ctx) => {
    const headers = ctx.prerun
      ?.resolve({
        field: "headerColumns",
        allowPermanentAbsence: true,
      })
      ?.getDataAsJson<string[]>();
    if (headers === undefined) return undefined;
    // A workbook with a trailing empty column yields an empty header, which would show up as a
    // blank option in every mapping dropdown and cannot be mapped to anything.
    return headers.filter((h) => h.trim().length > 0);
  })

  .retentiveOutput("validationResult", (ctx) => {
    const headerColumns = ctx.prerun
      ?.resolve({
        field: "headerColumns",
        allowPermanentAbsence: true,
      })
      ?.getDataAsJson<string[]>();

    if (!headerColumns || !ctx.data.format) {
      return undefined;
    }

    const format = ctx.data.format;
    const headers = headerColumns;

    if (format === "qiagen") {
      const qiagenColumns = [
        "read set",
        "chain",
        "V-region",
        "J-region",
        "CDR3 nucleotide seq",
        "CDR3 amino acid seq",
        "frequency",
        "rank",
        "UMIs with analytical threshold",
        "nucleotide length",
        "amino acid length",
      ];

      const missingColumns = qiagenColumns.filter((col) => !headers.includes(col));

      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: "qiagen",
      };
    }

    if (format === "immunoSeq") {
      const hasAny = (aliases: string[]) => aliases.some((alias) => headers.includes(alias));
      const missingColumns: string[] = [];
      if (!hasAny(["rearrangement", "nucleotide"])) missingColumns.push("sequence");
      if (!hasAny(["amino_acid_sequence", "amino_acid", "aminoAcid"]))
        missingColumns.push("cdr3-aa");
      if (!hasAny(["v_gene", "v-gene", "vGene", "vGeneName"])) missingColumns.push("v-gene");
      if (!hasAny(["d_gene", "d-gene", "dGene", "dGeneName"])) missingColumns.push("d-gene");
      if (!hasAny(["j_gene", "j-gene", "jGene", "jGeneName"])) missingColumns.push("j-gene");
      if (!hasAny(["v-index", "v_index", "vIndex"])) missingColumns.push("v-begin");
      if (!hasAny(["count (templates/reads)", "count (reads)", "seq_reads", "reads", "count"])) {
        missingColumns.push("read-count");
      }

      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: "immunoSeq",
      };
    }

    if (format === "mixcr") {
      // MiXCR minimal requirements aligned with infer-columns-mixcr.lib.tengo
      const mixcrRequiredHeaders = ["readCount", "nSeqCDR3", "aaSeqCDR3"];

      const missingColumns = mixcrRequiredHeaders.filter((col) => !headers.includes(col));

      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: "mixcr",
      };
    }

    if (format === "mixcr-sc") {
      // Same as MiXCR plus at least one tagValueCELL* column
      const mixcrRequiredHeaders = ["readCount", "nSeqCDR3", "aaSeqCDR3"];
      const missingBase = mixcrRequiredHeaders.filter((col) => !headers.includes(col));
      const hasTagValueCell = headers.some((h) => h.startsWith("tagValueCELL"));
      const missingColumns = [
        ...missingBase,
        ...(hasTagValueCell ? ([] as string[]) : ["tagValueCELL*"]),
      ];
      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: "mixcr-sc",
      };
    }

    if (format === "cellranger") {
      // Cell Ranger VDJ clones per-chain table minimal required headers
      const cellrangerRequired = ["cdr3_nt", "cdr3", "v_gene", "j_gene", "barcode"];
      const missingColumns = cellrangerRequired.filter((col) => !headers.includes(col));
      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: "cellranger",
      };
    }

    if (format === "airr" || format === "airr-sc") {
      // AIRR format uses case-insensitive column names
      // Required: duplicate_count, junction (CDR3 nt), v_call, j_call
      // For single-cell: also requires cell_id
      // Handle case where headerColumns might be a single comma-separated string or array of strings
      const flattenedHeaders: string[] = [];
      for (const h of headers) {
        const str = String(h).trim();
        // If the string contains commas, split it
        if (str.includes(",")) {
          flattenedHeaders.push(
            ...str
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0),
          );
        } else {
          flattenedHeaders.push(str);
        }
      }
      const headersLower = flattenedHeaders.map((h) => h.toLowerCase());
      const airrRequired = ["duplicate_count", "junction", "v_call", "j_call"];
      const missingColumns = airrRequired.filter((req) => !headersLower.includes(req));

      // For single-cell AIRR, also require cell_id
      if (format === "airr-sc") {
        const hasCellId = headersLower.includes("cell_id");
        if (!hasCellId) {
          missingColumns.push("cell_id");
        }
      }

      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: format,
      };
    }

    // For other formats, validation is handled elsewhere or not needed
    return {
      isValid: true,
      missingColumns: [],
      format: format,
    };
  })

  /**
   * What the import actually emitted: one entry per exported p-column, with the axes and
   * domain that give it its identity.
   *
   * Read from the workflow's own output rather than derived from the mapping, so it reports
   * what was produced rather than what was intended — which is what makes it useful when a
   * downstream block cannot see the dataset and the question is whether the column is missing
   * or merely differently keyed.
   */
  .output("importedColumns", (ctx) => {
    const cols = ctx.outputs?.resolve("result")?.getPColumns();
    if (cols === undefined) return undefined;
    return cols.map((c) => ({
      name: c.spec.name,
      valueType: c.spec.valueType,
      domain: c.spec.domain ?? {},
      annotations: c.spec.annotations ?? {},
      axes: (c.spec.axesSpec ?? []).map((a) => ({ name: a.name, domain: a.domain ?? {} })),
    }));
  })

  .outputWithStatus("stats", (ctx) => {
    const pCols = ctx.outputs?.resolve("stats")?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    // Anchor on the annotated count. Every column here — the four counts and the chain label —
    // keys on the single chain axis, so the choice does not affect the join; it decides what V3
    // discovers labels against and what stays permanently visible, since visibility rules are
    // never applied to primary columns. The annotated count is emitted for every run.
    const primary = pCols.find((c) => c.spec.name.endsWith("/annotatedCount"));
    if (primary === undefined) {
      return undefined;
    }

    // V3 rather than V2 because it filters a saved sort or filter that names a column the
    // current run does not emit, where V2 threw and failed the whole output. Changing the
    // receptor set changes the emitted columns, so that state is reachable by ordinary use.
    return createPlDataTableV3(ctx, {
      primaryColumns: [DataColumn.fromColumn(primary)],
      columns: pCols.filter((c) => c.id !== primary.id).map((c) => DataColumn.fromColumn(c)),
      tableState: ctx.data.tableState,
    });
  })

  .sections((_ctx) => [{ type: "link", href: "/", label: "Main" }])

  .title(() => "Import V(D)J Data")

  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel || "")

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
