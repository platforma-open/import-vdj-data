/*
  End-to-end test of the AIRR import path.

  The fixtures are real output from the three toolchains that produce AIRR rearrangement TSVs —
  MiXCR `exportAirr`, IgBLAST `-outfmt 19`, and Change-O `MakeDb` + `DefineClones` — over the
  same reads. They are what makes this worth running: the three disagree about exactly the
  things the import has to reconcile, and no hand-written fixture would have caught it.

    - MiXCR always emits an `fwr1` column and never fills it on an FR1-primer amplicon, so a
      file whose header promises VDJRegion cannot deliver it.
    - IgBLAST and Change-O put the conserved Cys at the end of `fwr3` and the Trp/Phe at the
      start of `fwr4`; MiXCR stops both short of the CDR3. Concatenating without normalising
      duplicates two codons.
    - Change-O gaps its region columns with IMGT spacers on every row; the others do not.
    - Only Change-O carries `clone_id`.

  `airr-sc` is not the path a Cell Ranger or MiXCR user takes since the block reads both natively,
  so it exists for files somebody assembled by hand. This one is exactly that: paired heavy and 
  kappa sequences of named monoclonal antibodies (public GenBank records), re-annotated with 
  IgBLAST, with `cell_id` standing in for the antibody. Two rows per "cell", every cell complete.

  All four load into ONE Samples & Data block and one test, not five. The project fixture is
  per-test, so scenarios can only share an upload by sharing a test — and what that saves is not
  only the repeated uploads but four fewer projects in the backend's rocksdb, which CI archives
  and uploads whole after every run.

  Each fixture is four usable rows plus one unusable, and the rows are chosen rather than
  sampled. Everything the import derives is a rate or a majority over rows, so at n=4 the
  selection has to leave each one unambiguous:

    - region fill, which decides whether a column counts as present, is 1.0 everywhere except
      MiXCR's `fwr1` at 0.0 — the one that makes it fall back;
    - the IMGT boundary vote is 1.0 for IgBLAST and Change-O, 0.0 for MiXCR.

  So regenerate by picking rows whose regions are all filled, not by taking a head or a stride.
  The vote needs a strict majority: at four rows one odd row still leaves 0.75, but two give 0.5
  and the trim silently stops firing. An earlier 60-row attempt was bitten by the same arithmetic
  from the other side — IgBLAST's first rows lack `fwr1`, so a `head -n` fixture read as 27% fill,
  tripped the 50% presence rule, and tested the CDR3 fallback while claiming to test VDJRegion.

  Change-O and the single-cell file have no unusable row because those toolchains do not write
  one: MakeDb emits only complete records, and the mAb file is curated.
*/

import { datasetCheckKey } from "@platforma-open/milaboratories.import-vdj.model";
import { SamplesAndDataBlockPointer } from "@platforma-open/milaboratories.samples-and-data";
import type { PlRef } from "@platforma-sdk/model";
import { createPlDataTableStateV2, uniquePlId } from "@platforma-sdk/model";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { ImportVdjBlockPointer } from "this-block";

type Emitted = {
  name: string;
  valueType: string;
  domain: Record<string, string>;
  annotations: Record<string, string>;
  axes: { name: string; domain: Record<string, string> }[];
};

/** The pieces of a blockTest's fixture the helpers below need. */
type TestCtx = Pick<
  Parameters<NonNullable<Parameters<typeof blockTest>[2]>>[0],
  "rawPrj" | "helpers" | "expect"
>;

const FIXTURES = [
  { asset: "airr-changeo.tsv", label: "changeo" },
  { asset: "airr-igblast.tsv", label: "igblast" },
  { asset: "airr-mixcr.tsv", label: "mixcr-airr" },
  { asset: "airr-sc-pc39.tsv", label: "pc39" },
  // Not AIRR, and here on purpose: `import-common` serves MiXCR and Cell Ranger as well, so
  // every ungated change in it lands on them too. Five MiXCR clones assembled by CDR3, four
  // productive and one frameshifted, is enough to notice if that path stops working.
  { asset: "mixcr-clones.tsv", label: "mixcr-clones" },
  // No junction column, so it has to be rebuilt from cdr3 and the framework flanks
  { asset: "airr-igblast-nojunction.tsv", label: "igblast-nojunction" },
  { asset: "airr-mixcr-nojunction.tsv", label: "mixcr-nojunction" },
  // One dataset, two samples, two boundary conventions: the vote has to be taken per sample
  { asset: "airr-conv-imgt.tsv", label: "twoconv", extra: "airr-conv-mixcr.tsv" },
];

/** Unwraps a model output, which arrives as `{ ok, value, stable }` rather than bare. */
function unwrap<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  return ((raw as { value?: T[] } | undefined)?.value ?? []) as T[];
}

/**
 * Loads every fixture into ONE Samples & Data block, as four samples of one dataset each.
 *
 * One block rather than one per scenario, and therefore one test rather than five: the project
 * fixture is per-test, so scenarios can only share an upload by sharing a test. What that buys
 * is not just the four repeated uploads -- it is four fewer projects in the backend's rocksdb,
 * which CI tars and uploads whole as `platforma-dump` after every run.
 */
async function loadFixtures(ctx: TestCtx): Promise<string> {
  const { rawPrj: project, helpers } = ctx;
  const blockId = await project.addBlock("Samples & Data", SamplesAndDataBlockPointer);

  const sampleIds: string[] = [];
  const sampleLabels: Record<string, string> = {};
  const datasets = [];
  for (const f of FIXTURES) {
    const data: Record<string, unknown> = {};
    for (const asset of f.extra ? [f.asset, f.extra] : [f.asset]) {
      const sampleId = uniquePlId();
      sampleIds.push(sampleId);
      sampleLabels[sampleId] = f.label;
      data[sampleId] = await helpers.getLocalFileHandle(`./assets/${asset}`);
    }
    datasets.push({
      id: uniquePlId(),
      label: f.label,
      content: { type: "Xsv", xsvType: "tsv", data },
    });
  }

  await project.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: {
      suggestedImport: false,
      h5adFilesToPreprocess: [],
      seuratFilesToPreprocess: [],
      metadata: [],
      sampleIds,
      sampleLabelColumnLabel: "Sample Name",
      sampleLabels,
      datasets,
    },
  });
  await project.runBlock(blockId);
  await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 300000);
  return blockId;
}

/**
 * Adds one import block over the named dataset and hands back what it emitted.
 *
 * `prerunCheck` is supplied rather than awaited: the UI writes it from prerun's output through a
 * watcher (`ui/src/app.ts`), and nothing in a headless run does that. Keying it with the model's
 * own `datasetCheckKey` means a change to what the verdict covers fails here rather than
 * silently arming Run on a stale one.
 */
async function importFrom(
  ctx: TestCtx,
  opts: {
    label: string;
    assemblingFeature?: string;
    format?: "airr" | "airr-sc" | "mixcr";
    chains?: string[];
  },
): Promise<{ columns: Emitted[]; stats: Emitted[]; emptySamples: string[] }> {
  const { rawPrj: project, helpers, expect } = ctx;

  const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);
  const beforePick = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
    outputs?: Record<string, unknown>;
  };

  // Exact match, never a substring: one label being another's prefix silently hands the
  // scenario a different dataset, and the run fails somewhere far from the cause.
  const options = unwrap<{ ref: PlRef; label: string }>(beforePick.outputs?.datasetOptions);
  const picked =
    options.find((o) => o.label === opts.label) ??
    options.find((o) => o.label.endsWith(`/${opts.label}`));
  expect(
    picked,
    `dataset option for ${opts.label} among ${options.map((o) => o.label)}`,
  ).toBeDefined();

  const datasetRef = picked!.ref;
  const format = opts.format ?? "airr";

  await project.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: {
      defaultBlockLabel: opts.label,
      customBlockLabel: "",
      datasetRef,
      format,
      chains: opts.chains ?? ["IGHeavy"],
      primaryCountType: "read",
      assemblingFeature: opts.assemblingFeature,
      tableState: createPlDataTableStateV2(),
      settingsOpen: true,
      prerunCheck: {
        check: "dataset" as const,
        subject: datasetCheckKey({ datasetRef, format })!,
        columnsPresent: true,
      },
    },
  });

  await project.runBlock(blockId);
  await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

  const state = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
    outputs?: Record<string, unknown>;
  };
  const columns = unwrap<Emitted>(state.outputs?.importedColumns);
  // The two frames are separate: `result` is what was imported, `stats` what the import counted.
  const stats = unwrap<Emitted>(state.outputs?.statColumns);
  // Samples that produced no clonotype at all, read straight off the per-sample counts.
  const empty = (state.outputs?.emptyChainSamples as { value?: { emptySamples?: string[] } })
    ?.value;
  const emptySamples = empty?.emptySamples ?? [];
  expect(columns.length).toBeGreaterThan(0);
  return { columns, stats, emptySamples };
}

/** The feature the import actually assembled on, read off the column it marked as the main one. */
function assembledFeature(columns: Emitted[]): string | undefined {
  return columns.find(
    (c) =>
      c.name === "pl7.app/vdj/sequence" &&
      c.domain["pl7.app/alphabet"] === "nucleotide" &&
      c.annotations["pl7.app/vdj/isMainSequence"] === "true",
  )?.domain["pl7.app/vdj/feature"];
}

/**
 * The structure stamped on the clonotype axis, which is what decides cross-dataset joins.
 *
 * Not a friendly name: `buildClonotypeKeyStructure` encodes each key column's own spec, so the
 * feature reads as `["pl7.app/vdj/feature","VDJRegion"]` inside a JSON array.
 */
function keyStructure(columns: Emitted[]): string | undefined {
  for (const c of columns) {
    const axis = c.axes.find(
      (a) => a.name === "pl7.app/vdj/clonotypeKey" || a.name === "pl7.app/vdj/scClonotypeKey",
    );
    const structure =
      axis?.domain["pl7.app/vdj/clonotypeKey/structure"] ??
      axis?.domain["pl7.app/vdj/scClonotypeKey/structure"];
    if (structure !== undefined) return structure;
  }
  return undefined;
}

const has = (columns: Emitted[], name: string) => columns.some((c) => c.name === name);

blockTest(
  "imports AIRR files from each toolchain that writes them",
  { timeout: 1800000 },
  async ({ rawPrj, helpers, expect }) => {
    const ctx = { rawPrj, helpers, expect };
    await loadFixtures(ctx);

    // --- Change-O, asked for VDJRegion -------------------------------------------------
    {
      const { columns } = await importFrom(ctx, {
        label: "changeo",
        assemblingFeature: "VDJRegion",
      });

      // Change-O fills every region on every row, so the feature asked for is the one it gets.
      expect(assembledFeature(columns)).toBe("VDJRegion");
      expect(keyStructure(columns)).toContain('["pl7.app/vdj/feature","VDJRegion"]');

      // The alignments ride along untouched, which is what lineage-trees reads.
      expect(has(columns, "pl7.app/vdj/sequenceAlignment")).toBe(true);
      expect(has(columns, "pl7.app/vdj/germlineAlignment")).toBe(true);

      // clusterId is an AXIS, never a value column: a clonotype sits in one source clone per
      // sample, so a membership column keyed on the clonotype alone would have duplicate keys.
      const linker = columns.find((c) => c.name === "pl7.app/link");
      expect(linker).toBeDefined();
      expect(linker!.axes.map((a) => a.name)).toEqual([
        "pl7.app/clusterId",
        "pl7.app/vdj/clonotypeKey",
      ]);
      expect(linker!.annotations["pl7.app/isLinkerColumn"]).toBe("true");

      const size = columns.find((c) => c.name === "pl7.app/clustering/clusterSize");
      expect(size).toBeDefined();
      expect(size!.axes.map((a) => a.name)).toEqual(["pl7.app/clusterId"]);
    }

    // --- IgBLAST, asked for VDJRegion --------------------------------------------------
    {
      const { columns, stats } = await importFrom(ctx, {
        label: "igblast",
        assemblingFeature: "VDJRegion",
      });

      expect(assembledFeature(columns)).toBe("VDJRegion");

      // IgBLAST assigns a V call to reads that are not rearrangements at all, so the CDR3 filter
      // is what removes them -- and the counters have to say so rather than blaming the feature.
      expect(has(stats, "pl7.app/vdj/stat/recordCount")).toBe(true);
      expect(has(stats, "pl7.app/vdj/stat/recordsWithoutCdr3")).toBe(true);
      expect(has(stats, "pl7.app/vdj/stat/recordsNotCoveringAssemblingFeature")).toBe(true);

      // No chain in the domain: the standards do not differ by chain, and a row with no V call
      // belongs to none of them.
      const recordCount = stats.find((c) => c.name === "pl7.app/vdj/stat/recordCount")!;
      expect(recordCount.domain["pl7.app/vdj/chain"]).toBeUndefined();
    }

    // --- MiXCR, asked for a region its header promises but never fills -----------------
    {
      const { columns, stats } = await importFrom(ctx, {
        label: "mixcr-airr",
        assemblingFeature: "VDJRegion",
      });

      // `fwr1` is a column here and empty on every row. The setting is honoured anyway: the
      // header carries the region, so the key is the one that was asked for.
      expect(assembledFeature(columns)).toBe("VDJRegion");
      expect(keyStructure(columns)).toContain('["pl7.app/vdj/feature","VDJRegion"]');

      // Every row then fails to cover it and is discarded, which is the counter's whole job --
      // an empty import the scientist can explain beats a full one they did not ask for.
      expect(has(stats, "pl7.app/vdj/stat/recordsNotCoveringAssemblingFeature")).toBe(true);
    }

    // --- two conventions in one dataset ------------------------------------------------
    {
      // The IMGT sample outnumbers the other 4 rows to 2. Pooled, its fwr4 would carry the vote,
      // trim the second sample's single-codon fwr4 to nothing and leave it with no clonotype.
      const { emptySamples } = await importFrom(ctx, {
        label: "twoconv",
        assemblingFeature: "VDJRegion",
      });
      expect(emptySamples, "each sample votes on its own rows").toEqual([]);
    }

    // --- no junction column, in both boundary conventions ------------------------------
    for (const label of ["igblast-nojunction", "mixcr-nojunction"]) {
      // IMGT fwr3 ends on the conserved Cys and is spliced back on; MiXCR's stops before it, so
      // the flanks are absent from the file and the cdr3 is left as it is.
      const { columns } = await importFrom(ctx, { label });
      expect(assembledFeature(columns), label).toBe("CDR3");
      expect(keyStructure(columns), label).toContain('["pl7.app/vdj/feature","CDR3"]');
    }

    // --- the default, over the file that could have carried more -----------------------
    {
      // Same dataset as the first scenario, with no feature asked for. The default is CDR3
      // rather than the widest span the data would support: the feature reaches the clonotype
      // axis domain, so it decides whether two imports join, and that is the scientist's call.
      const { columns } = await importFrom(ctx, { label: "changeo" });

      expect(assembledFeature(columns)).toBe("CDR3");
      expect(keyStructure(columns)).toContain('["pl7.app/vdj/feature","CDR3"]');

      // The regions are still emitted as their own columns -- not assembling on them is not the
      // same as dropping them.
      const fr3 = columns.find(
        (c) => c.name === "pl7.app/vdj/sequence" && c.domain["pl7.app/vdj/feature"] === "FR3",
      );
      expect(fr3).toBeDefined();
    }

    // --- paired single cell ------------------------------------------------------------
    {
      const { columns, stats } = await importFrom(ctx, {
        label: "pc39",
        format: "airr-sc",
        chains: ["IGHeavy", "IGLight"],
      });

      // Both chains arrive, on the paired axis, as the primary rearrangement of their cell.
      for (const chain of ["A", "B"]) {
        const cdr3 = columns.find(
          (c) =>
            c.name === "pl7.app/vdj/sequence" &&
            c.domain["pl7.app/vdj/feature"] === "CDR3" &&
            c.domain["pl7.app/alphabet"] === "nucleotide" &&
            c.domain["pl7.app/vdj/scClonotypeChain"] === chain,
        );
        expect(cdr3, `CDR3 nt for chain ${chain}`).toBeDefined();
        expect(cdr3!.domain["pl7.app/vdj/scClonotypeChain/index"]).toBe("primary");
      }

      // What cell_id buys: a linker from the cell to the paired clonotype. Without it the
      // barcodes are read and then thrown away, which is what the old `clone_id`-as-cell-tag
      // bug did -- it keyed every cell on a column that was not a cell.
      const cellLinker = columns.find((c) => c.name === "pl7.app/sc/cellLinker");
      expect(cellLinker).toBeDefined();
      expect(cellLinker!.axes.map((a) => a.name)).toEqual([
        "pl7.app/sampleId",
        "pl7.app/sc/cellId",
        "pl7.app/vdj/scClonotypeKey",
      ]);

      // Abundance is counted in cells here, not reads, and is the only thing besides the linker
      // keeping the sample axis. Everything else is a property of the paired clonotype, because
      // consumers match axes positionally and a stray sample axis makes a column invisible.
      expect(columns.some((c) => c.name === "pl7.app/vdj/uniqueCellCount")).toBe(true);
      for (const c of columns) {
        if (c.name === "pl7.app/sc/cellLinker") continue;
        if (c.name.startsWith("pl7.app/vdj/uniqueCell") && c.axes.length === 2) continue;
        expect(
          c.axes.map((a) => a.name),
          c.name,
        ).toEqual(["pl7.app/vdj/scClonotypeKey"]);
      }

      // The rework's new columns have to survive the paired path too, per chain and alphabet.
      for (const chain of ["A", "B"]) {
        for (const alphabet of ["nucleotide", "aminoacid"]) {
          for (const name of ["pl7.app/vdj/sequenceAlignment", "pl7.app/vdj/germlineAlignment"]) {
            const col = columns.find(
              (c) =>
                c.name === name &&
                c.domain["pl7.app/alphabet"] === alphabet &&
                c.domain["pl7.app/vdj/scClonotypeChain"] === chain,
            );
            expect(col, `${name} ${alphabet} chain ${chain}`).toBeDefined();
          }
        }
      }

      // The discard counters are dataset-level on this path too -- one set, not one per chain.
      expect(has(stats, "pl7.app/vdj/stat/recordCount")).toBe(true);
      expect(has(stats, "pl7.app/vdj/stat/recordsWithoutVGene")).toBe(true);
      expect(stats.filter((c) => c.name === "pl7.app/vdj/stat/recordCount")).toHaveLength(1);
    }

    // --- MiXCR, which shares `import-common` with everything above ---------------------
    {
      const { columns, stats } = await importFrom(ctx, {
        label: "mixcr-clones",
        format: "mixcr",
      });

      // A CDR3-assembled repertoire, which is what most MiXCR bulk users hold. The point is
      // less what it asserts than that it runs: the degap, the CDR3 requirement and the
      // discard counters all sit in shared code, so this is the path that notices.
      expect(assembledFeature(columns)).toBe("CDR3");
      expect(keyStructure(columns)).toContain('["pl7.app/vdj/feature","CDR3"]');
      expect(has(columns, "pl7.app/vdj/readCount")).toBe(true);

      // Genes reach the frame through allVHitsWithScore rather than a bestVGene column.
      expect(has(columns, "pl7.app/vdj/geneHit")).toBe(true);
      expect(has(columns, "pl7.app/vdj/geneHitWithAllele")).toBe(true);

      // The counters follow the import template, not the format: MiXCR goes through
      // `import-common`, so it gets them. immunoSeq, qiagen and custom do not and must not --
      // their templates return tsv and stats alone, and a path nothing fills never resolves.
      expect(has(stats, "pl7.app/vdj/stat/recordCount")).toBe(true);
    }
  },
);
