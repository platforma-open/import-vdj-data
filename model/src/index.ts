import type { InferOutputsType, PlDataTableStateV2, PlRef } from '@platforma-sdk/model';
import { BlockModel, createPlDataTableStateV2, createPlDataTableV2, PColumnCollection } from '@platforma-sdk/model';

export type BlockArgs = {
  datasetRef?: PlRef;
  format?: 'immunoSeq' | 'mixcr' | 'airr' | 'custom';
  chains: string[];
  customMapping?: Record<string, string | undefined>;
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
    const { datasetRef, format, chains, customMapping } = ctx.args;
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

    // Non-custom formats: dataset + format + chains are sufficient
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
