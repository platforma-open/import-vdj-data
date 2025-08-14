import polars as pl
import json
import argparse
import sys
import os


def get_column_names(file_path: str, separator: str) -> list[str]:
    """
    Reads a file's header using polars and returns the column names.
    """
    try:
        # n_rows=0 is an efficient way to read only the header
        df = pl.read_csv(file_path,
                         has_header=True,
                         separator=separator,
                         n_rows=0,
                         infer_schema=False)
        return df.columns
    except Exception as e:
        print(f"Error reading file with polars: {e}", file=sys.stderr)
        exit(1)


def main():
    """
    Main function to parse arguments and print column names as a JSON array.
    """
    parser = argparse.ArgumentParser(
        description='Parse a file and print its column headers as a JSON array.'
    )
    parser.add_argument('input_file', type=str, help='Path to the input file.')
    args = parser.parse_args()

    # Automatically determine separator from file extension, handling .gz
    input_path_lower = args.input_file.lower()
    if input_path_lower.endswith('.tsv') or input_path_lower.endswith('.tsv.gz'):
        separator = '\t'
    else:
        separator = ','

    columns = get_column_names(args.input_file, separator)

    # Sort the column names to ensure stable output
    columns.sort()

    # Print the column names as a JSON array to stdout
    print(json.dumps(columns))


if __name__ == '__main__':
    main()
