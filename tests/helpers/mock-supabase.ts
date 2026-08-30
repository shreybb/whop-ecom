type Row = Record<string, unknown>;

type Filter =
	| { kind: "eq"; column: string; value: unknown }
	| { kind: "in"; column: string; values: unknown[] }
	| { kind: "not"; column: string; operator: string; value: unknown }
	| { kind: "gte"; column: string; value: unknown }
	| { kind: "is"; column: string; value: unknown }
	| { kind: "or"; expression: string };

type QueryResult = { data: Row[] | null; error: null; count?: number | null };

export type RecordedQuery = {
	table: string;
	action: "select" | "insert" | "update" | "delete";
	filters: Filter[];
	patch?: Row;
	insert?: Row | Row[];
};

function matchesOr(row: Row, expression: string): boolean {
	const parts = expression.split(",");
	for (const part of parts) {
		const [column, op, rawValue] = part.split(".");
		if (op === "is" && rawValue === "null" && (row[column] === null || row[column] === undefined)) {
			return true;
		}
		if (op === "neq") {
			const value = rawValue === "null" ? null : rawValue;
			if (row[column] !== value) return true;
		}
	}
	return false;
}

const tableLocks = new Map<string, Promise<void>>();

function matchesFilters(row: Row, filters: Filter[]): boolean {
	for (const filter of filters) {
		switch (filter.kind) {
			case "eq":
				if (row[filter.column] !== filter.value) return false;
				break;
			case "in":
				if (!filter.values.includes(row[filter.column])) return false;
				break;
			case "not":
				if (filter.operator === "is" && filter.value === null) {
					if (row[filter.column] === null || row[filter.column] === undefined) return false;
				}
				break;
			case "gte":
				if (String(row[filter.column] ?? "") < String(filter.value)) return false;
				break;
			case "is":
				if (filter.value === null) {
					if (row[filter.column] !== null && row[filter.column] !== undefined) return false;
				} else if (row[filter.column] !== filter.value) return false;
				break;
			case "or":
				if (!matchesOr(row, filter.expression)) return false;
				break;
		}
	}
	return true;
}

class QueryBuilder {
	private action: RecordedQuery["action"] = "select";
	private patch: Row = {};
	private insertRows: Row[] = [];
	private filters: Filter[] = [];
	private limitCount: number | null = null;
	private orderColumn: string | null = null;
	private orderAscending = true;
	private head = false;
	private countExact = false;
	private returning = false;

	constructor(
		private readonly table: string,
		private readonly store: Map<string, Row[]>,
		private readonly recorded: RecordedQuery[],
	) {}

	select(_columns = "*", opts?: { count?: string; head?: boolean }) {
		if (this.action === "update" || this.action === "insert" || this.action === "delete") {
			this.returning = true;
			return this;
		}
		this.action = "select";
		this.head = opts?.head ?? false;
		this.countExact = opts?.count === "exact";
		return this;
	}

	insert(row: Row | Row[]) {
		this.action = "insert";
		this.insertRows = Array.isArray(row) ? row : [row];
		return this;
	}

	update(patch: Row) {
		this.action = "update";
		this.patch = patch;
		return this;
	}

	delete() {
		this.action = "delete";
		return this;
	}

	eq(column: string, value: unknown) {
		this.filters.push({ kind: "eq", column, value });
		return this;
	}

	in(column: string, values: unknown[]) {
		this.filters.push({ kind: "in", column, values });
		return this;
	}

	not(column: string, operator: string, value: unknown) {
		this.filters.push({ kind: "not", column, operator, value });
		return this;
	}

	gte(column: string, value: unknown) {
		this.filters.push({ kind: "gte", column, value });
		return this;
	}

	is(column: string, value: unknown) {
		if (value === null) {
			this.filters.push({ kind: "is", column, value: null });
		}
		return this;
	}

	or(expression: string) {
		this.filters.push({ kind: "or", expression });
		return this;
	}

	order(column: string, opts?: { ascending?: boolean }) {
		this.orderColumn = column;
		this.orderAscending = opts?.ascending ?? true;
		return this;
	}

	limit(count: number) {
		this.limitCount = count;
		return this;
	}

	maybeSingle() {
		this.limitCount = 1;
		return this.thenable(async () => {
			const result = await this.execute();
			return { data: result.data?.[0] ?? null, error: null };
		});
	}

	single() {
		return this.thenable(async () => {
			const result = await this.execute();
			return { data: result.data?.[0] ?? null, error: null };
		});
	}

	private thenable<T>(executor: () => Promise<T>) {
		return {
			then(onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) {
				return executor().then(onFulfilled, onRejected);
			},
		};
	}

	then(onFulfilled?: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) {
		return this.execute().then(onFulfilled, onRejected);
	}

	private rows(): Row[] {
		if (!this.store.has(this.table)) this.store.set(this.table, []);
		return this.store.get(this.table)!;
	}

	private record() {
		this.recorded.push({
			table: this.table,
			action: this.action,
			filters: [...this.filters],
			...(this.action === "update" ? { patch: { ...this.patch } } : {}),
			...(this.action === "insert" ? { insert: this.insertRows.length === 1 ? this.insertRows[0] : this.insertRows } : {}),
		});
	}

	async execute(): Promise<QueryResult> {
		const prev = tableLocks.get(this.table) ?? Promise.resolve();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		tableLocks.set(this.table, prev.then(() => gate));
		await prev;
		try {
		return await this.executeLocked();
		} finally {
			release();
		}
	}

	private async executeLocked(): Promise<QueryResult> {
		this.record();
		const tableRows = this.rows();

		if (this.action === "insert") {
			for (const row of this.insertRows) {
				tableRows.push({ ...row });
			}
			return { data: this.insertRows, error: null };
		}

		const matched = tableRows.filter((row) => matchesFilters(row, this.filters));
		if (this.orderColumn) {
			matched.sort((a, b) => {
				const av = String(a[this.orderColumn!] ?? "");
				const bv = String(b[this.orderColumn!] ?? "");
				return this.orderAscending ? av.localeCompare(bv) : bv.localeCompare(av);
			});
		}
		const limited = this.limitCount === null ? matched : matched.slice(0, this.limitCount);

		if (this.action === "update") {
			for (const row of matched) Object.assign(row, this.patch);
			return { data: matched.map((row) => ({ ...row })), error: null };
		}

		if (this.action === "delete") {
			const keep = tableRows.filter((row) => !matchesFilters(row, this.filters));
			this.store.set(this.table, keep);
			return { data: null, error: null };
		}

		if (this.head && this.countExact) {
			return { data: null, error: null, count: matched.length };
		}

		return { data: limited.map((row) => ({ ...row })), error: null };
	}
}

export function createMockSupabase(initial: Record<string, Row[]> = {}) {
	const store = new Map<string, Row[]>(
		Object.entries(initial).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
	);
	const recorded: RecordedQuery[] = [];

	return {
		store,
		recorded,
		client: {
			from(table: string) {
				return new QueryBuilder(table, store, recorded);
			},
		},
	};
}

export function getCompanyIdFilters(recorded: RecordedQuery[]): string[] {
	const ids: string[] = [];
	for (const query of recorded) {
		for (const filter of query.filters) {
			if (filter.kind === "eq" && filter.column === "company_id") ids.push(String(filter.value));
		}
	}
	return ids;
}
