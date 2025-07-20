import type { InferOutputsType, PlDataTableStateV2, PlRef } from '@platforma-sdk/model';
import { BlockModel, createPlDataTableStateV2, createPlDataTableV2, PColumnCollection } from '@platforma-sdk/model';

export type BlockArgs = {
  datasetRef?: PlRef;
  format?: 'immunoSeq' | 'mixcr' | 'airr';
  chains: string[];
};

export type UiState = {
  tableState: PlDataTableStateV2;
  title: string;
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
  })

  .argsValid((ctx) => ctx.args.datasetRef !== undefined && ctx.args.format !== undefined)

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
