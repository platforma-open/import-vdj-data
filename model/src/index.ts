import type { InferOutputsType, PlDataTableStateV2, PlRef } from '@platforma-sdk/model';
import { BlockModel, createPlDataTableStateV2, createPlDataTableV2, PColumnCollection } from '@platforma-sdk/model';

export type BlockArgs = {
  datasetRef?: PlRef;
  format?: 'immunoSeq' | 'qiagen' | 'mixcr' | 'mixcr-sc' | 'cellranger' | 'airr' | 'airr-sc' | 'custom';
  chains: string[];
  customMapping?: Record<string, string | undefined>;
  primaryCountType?: 'read' | 'umi';
  secondaryCountType?: 'read' | 'umi';
};

export type UiState = {
  tableState: PlDataTableStateV2;
  title: string;
  settingsOpen: boolean;
  qiagenColumnsPresent: boolean;
  immunoSeqColumnsPresent: boolean;
  mixcrColumnsPresent: boolean;
  crColumnsPresent: boolean;
  airrColumnsPresent: boolean;
};

export type ColumnDescription = {
  label: string;
  description: string;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    chains: ['IGHeavy', 'IGLight', 'TCRAlpha', 'TCRBeta', 'TCRDelta', 'TCRGamma'],
  })

  .withUiState<UiState>({
    tableState: createPlDataTableStateV2(),
    title: 'Import V(D)J Data',
    settingsOpen: true,
    qiagenColumnsPresent: false,
    immunoSeqColumnsPresent: false,
    mixcrColumnsPresent: false,
    crColumnsPresent: false,
    airrColumnsPresent: false,
  })

  .argsValid((ctx) => {
    const { datasetRef, format, chains, customMapping, primaryCountType } = ctx.args;
    if (datasetRef === undefined) return false;
    if (format === undefined) return false;
    if (!Array.isArray(chains) || chains.length === 0) return false;

    if (format === 'custom') {
      const m = customMapping ?? {};
      const hasSeq = !!m['cdr3-nt'] || !!m['cdr3-aa'];
      const hasV = !!m['v-gene'];
      const hasJ = !!m['j-gene'];
      const pct = primaryCountType ?? 'read';
      const hasPrimaryAbundance = pct === 'umi' ? !!m['umi-count'] : !!m['read-count'];
      return hasSeq && hasV && hasJ && hasPrimaryAbundance;
    }

    if (format === 'qiagen') {
      return ctx.uiState.qiagenColumnsPresent === true;
    }

    if (format === 'immunoSeq') {
      return ctx.uiState.immunoSeqColumnsPresent === true;
    }

    if (format === 'mixcr' || format === 'mixcr-sc') {
      return ctx.uiState.mixcrColumnsPresent === true;
    }

    if (format === 'cellranger') {
      return ctx.uiState.crColumnsPresent === true;
    }

    if (format === 'airr' || format === 'airr-sc') {
      return ctx.uiState.airrColumnsPresent === true;
    }

    // For other formats, basic args are sufficient
    return true;
  })

  .retentiveOutput('datasetOptions', (ctx) => {
    return ctx.resultPool.getOptions((v) => {
      const domain = v.domain;
      return (
        v.name === 'pl7.app/sequencing/data'
        && domain !== undefined
        && (domain['pl7.app/fileExtension'] === 'csv'
          || domain['pl7.app/fileExtension'] === 'csv.gz'
          || domain['pl7.app/fileExtension'] === 'tsv'
          || domain['pl7.app/fileExtension'] === 'tsv.gz')
      );
    });
  })

  .retentiveOutput('columnDescriptions', (ctx) => {
    return ctx.prerun?.resolve({
      field: 'columnDescriptions',
      allowPermanentAbsence: true,
    })?.getDataAsJson<ColumnDescription[]>();
  })

  .retentiveOutput('headerColumns', (ctx) => {
    return ctx.prerun?.resolve({
      field: 'headerColumns',
      allowPermanentAbsence: true,
    })?.getDataAsJson<string[]>();
  })

  .retentiveOutput('validationResult', (ctx) => {
    const headerColumns = ctx.prerun?.resolve({
      field: 'headerColumns',
      allowPermanentAbsence: true,
    })?.getDataAsJson<string[]>();

    if (!headerColumns || !ctx.args.format) {
      return undefined;
    }

    const format = ctx.args.format;
    const headers = headerColumns;

    if (format === 'qiagen') {
      const qiagenColumns = [
        'read set',
        'chain',
        'V-region',
        'J-region',
        'CDR3 nucleotide seq',
        'CDR3 amino acid seq',
        'frequency',
        'rank',
        'UMIs with analytical threshold',
        'nucleotide length',
        'amino acid length',
      ];

      const missingColumns = qiagenColumns.filter((col) => !headers.includes(col));

      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: 'qiagen',
      };
    }

    if (format === 'immunoSeq') {
      const hasAny = (aliases: string[]) => aliases.some((alias) => headers.includes(alias));
      const missingColumns: string[] = [];
      if (!hasAny(['rearrangement', 'nucleotide'])) missingColumns.push('sequence');
      if (!hasAny(['amino_acid_sequence', 'amino_acid', 'aminoAcid'])) missingColumns.push('cdr3-aa');
      if (!hasAny(['v_gene', 'v-gene', 'vGene', 'vGeneName'])) missingColumns.push('v-gene');
      if (!hasAny(['d_gene', 'd-gene', 'dGene', 'dGeneName'])) missingColumns.push('d-gene');
      if (!hasAny(['j_gene', 'j-gene', 'jGene', 'jGeneName'])) missingColumns.push('j-gene');
      if (!hasAny(['v-index', 'v_index', 'vIndex'])) missingColumns.push('v-begin');
      if (!hasAny(['count (templates/reads)', 'count (reads)', 'seq_reads', 'reads', 'count'])) {
        missingColumns.push('read-count');
      }

      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: 'immunoSeq',
      };
    }

    if (format === 'mixcr') {
      // MiXCR minimal requirements aligned with infer-columns-mixcr.lib.tengo
      const mixcrRequiredHeaders = [
        'readCount',
        'nSeqCDR3',
        'aaSeqCDR3',
      ];

      const missingColumns = mixcrRequiredHeaders.filter((col) => !headers.includes(col));

      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: 'mixcr',
      };
    }

    if (format === 'mixcr-sc') {
      // Same as MiXCR plus at least one tagValueCELL* column
      const mixcrRequiredHeaders = [
        'readCount',
        'nSeqCDR3',
        'aaSeqCDR3',
      ];
      const missingBase = mixcrRequiredHeaders.filter((col) => !headers.includes(col));
      const hasTagValueCell = headers.some((h) => h.startsWith('tagValueCELL'));
      const missingColumns = [...missingBase, ...(hasTagValueCell ? [] as string[] : ['tagValueCELL*'])];
      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: 'mixcr-sc',
      };
    }

    if (format === 'cellranger') {
      // Cell Ranger VDJ clones per-chain table minimal required headers
      const cellrangerRequired = [
        'cdr3_nt',
        'cdr3',
        'v_gene',
        'j_gene',
        'barcode',
      ];
      const missingColumns = cellrangerRequired.filter((col) => !headers.includes(col));
      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: 'cellranger',
      };
    }

    if (format === 'airr' || format === 'airr-sc') {
      // AIRR format uses case-insensitive column names
      // Required: duplicate_count, junction (CDR3 nt), v_call, j_call
      // For single-cell: also requires cell_id
      // Handle case where headerColumns might be a single comma-separated string or array of strings
      const flattenedHeaders: string[] = [];
      for (const h of headers) {
        const str = String(h).trim();
        // If the string contains commas, split it
        if (str.includes(',')) {
          flattenedHeaders.push(...str.split(',').map((s) => s.trim()).filter((s) => s.length > 0));
        } else {
          flattenedHeaders.push(str);
        }
      }
      const headersLower = flattenedHeaders.map((h) => h.toLowerCase());
      const airrRequired = [
        'duplicate_count',
        'junction',
        'v_call',
        'j_call',
      ];
      const missingColumns = airrRequired.filter((req) => !headersLower.includes(req));

      // For single-cell AIRR, also require cell_id
      if (format === 'airr-sc') {
        const hasCellId = headersLower.includes('cell_id');
        if (!hasCellId) {
          missingColumns.push('cell_id');
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

  .output('stats', (ctx) => {
    const pCols = ctx.outputs?.resolve('stats')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    const withLabels = new PColumnCollection()
      .addColumns(pCols)
      .getColumns(() => true) ?? [];

    return createPlDataTableV2(ctx, withLabels, ctx.uiState.tableState);
  })

  .sections((_ctx) => [{ type: 'link', href: '/', label: 'Main' }])

  .title((ctx) => ctx.uiState.title)

  .done(2);

export type BlockOutputs = InferOutputsType<typeof model>;
