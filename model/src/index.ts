import type { InferOutputsType, PlDataTableStateV2, PlRef } from '@platforma-sdk/model';
import { BlockModel, createPlDataTableStateV2, createPlDataTableV2, PColumnCollection } from '@platforma-sdk/model';

export type BlockArgs = {
  datasetRef?: PlRef;
  format?: 'immunoSeq' | 'qiagen' | 'mixcr' | 'airr' | 'custom';
  chains: string[];
  customMapping?: Record<string, string | undefined>;
  qiagenColumnsPresent?: boolean;
  immunoSeqColumnsPresent?: boolean;
};

export type UiState = {
  tableState: PlDataTableStateV2;
  title: string;
  settingsOpen: boolean;
};

export type ColumnDescription = {
  label: string;
  description: string;
};

export type ValidationResult = {
  isValid: boolean;
  missingColumns: string[];
  format: string;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    chains: ['IGHeavy', 'IGLight', 'TRA', 'TRB', 'TRD', 'TRG'],
  })

  .withUiState<UiState>({
    tableState: createPlDataTableStateV2(),
    title: 'Import V(D)J Data',
    settingsOpen: true,
  })

  .argsValid((ctx) => {
    const { datasetRef, format, chains, customMapping, qiagenColumnsPresent, immunoSeqColumnsPresent } = ctx.args;
    if (datasetRef === undefined) return false;
    if (format === undefined) return false;
    if (!Array.isArray(chains) || chains.length === 0) return false;

    if (format === 'custom') {
      const m = customMapping ?? {};
      const hasSeq = !!m['cdr3-nt'] || !!m['cdr3-aa'];
      const hasV = !!m['v-gene'];
      const hasJ = !!m['j-gene'];
      const hasAbundance = !!m['read-count'];
      return hasSeq && hasV && hasJ && hasAbundance;
    }

    if (format === 'qiagen') {
      return qiagenColumnsPresent === true;
    }

    if (format === 'immunoSeq') {
      return immunoSeqColumnsPresent === true;
    }

    // Other non-custom formats: dataset + format + chains are sufficient
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

    if (format === 'immunoSeq') {
      // Define ImmunoSeq source aliases for column mapping
      const sourceAliases: Record<string, string> = {
        // sequence (not necessarily cdr3)
        'rearrangement': 'sequence',
        'nucleotide': 'sequence',

        // cdr3 aa
        'amino_acid_sequence': 'cdr3-aa',
        'amino_acid': 'cdr3-aa',
        'aminoAcid': 'cdr3-aa',

        // read count columns
        'count (templates/reads)': 'read-count',
        'count (reads)': 'read-count',
        'seq_reads': 'read-count',
        'reads': 'read-count',
        'count': 'read-count',

        // umi count columns
        'count (templates)': 'umi-count',
        'templates': 'umi-count',
        'estimatedNumberGenomes': 'umi-count',

        // genes
        'v_gene': 'v-gene',
        'v-gene': 'v-gene',
        'vGene': 'v-gene',
        'vGeneName': 'v-gene',

        'd_gene': 'd-gene',
        'd-gene': 'd-gene',
        'dGene': 'd-gene',
        'dGeneName': 'd-gene',

        'j_gene': 'j-gene',
        'j-gene': 'j-gene',
        'jGene': 'j-gene',
        'jGeneName': 'j-gene',

        // alleles
        'vMaxResolved': 'v-allele',
        'vResolved': 'v-allele',

        'dMaxResolved': 'd-allele',
        'dResolved': 'd-allele',

        'jMaxResolved': 'j-allele',
        'jResolved': 'j-allele',

        // v begin
        'v-index': 'v-begin',
        'v_index': 'v-begin',
        'vIndex': 'v-begin',
      };

      const requiredColumns = ['sequence', 'cdr3-aa', 'v-gene', 'd-gene', 'j-gene', 'v-begin'];

      // Map headers to canonical column names
      const columnMapping: Record<string, string> = {};
      for (const h of headers) {
        const canonicalName = sourceAliases[h];
        if (canonicalName && !columnMapping[canonicalName]) {
          columnMapping[canonicalName] = h;
        }
      }

      // Check for required columns
      const missingColumns: string[] = [];
      for (const col of requiredColumns) {
        if (!columnMapping[col]) {
          missingColumns.push(col);
        }
      }

      // Check for abundance columns
      const hasReadCount = !!columnMapping['read-count'];
      const hasUmiCount = !!columnMapping['umi-count'];
      const hasAbundance = hasReadCount || hasUmiCount;

      if (!hasAbundance) {
        missingColumns.push('read-count or umi-count');
      }

      return {
        isValid: missingColumns.length === 0,
        missingColumns,
        format: 'immunoSeq',
      };
    } else if (format === 'qiagen') {
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

    // No validation for other formats
    return {
      isValid: true,
      missingColumns: [],
      format,
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

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
