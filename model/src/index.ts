import type { InferOutputsType, PlDataTableStateV2, PlRef } from '@platforma-sdk/model';
import { BlockModel, createPlDataTableStateV2, createPlDataTableV2, PColumnCollection } from '@platforma-sdk/model';

export type BlockArgs = {
  datasetRef?: PlRef;
  format?: 'immunoSeq' | 'qiagen' | 'mixcr' | 'cellranger' | 'airr' | 'custom';
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
  mixcrColumnsPresent: boolean;
  crColumnsPresent: boolean;
};

export type ColumnDescription = {
  label: string;
  description: string;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    chains: ['IGHeavy', 'IGLight', 'TRA', 'TRB', 'TRD', 'TRG'],
  })

  .withUiState<UiState>({
    tableState: createPlDataTableStateV2(),
    title: 'Import V(D)J Data',
    settingsOpen: true,
    qiagenColumnsPresent: false,
    mixcrColumnsPresent: false,
    crColumnsPresent: false,
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

    if (format === 'mixcr') {
      return ctx.uiState.mixcrColumnsPresent === true;
    }

    if (format === 'cellranger') {
      return ctx.uiState.crColumnsPresent === true;
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

    if (format === 'mixcr') {
      // MiXCR minimal requirements aligned with infer-columns-mixcr.lib.tengo
      // We validate presence of native MiXCR headers which map to canonical keys
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
