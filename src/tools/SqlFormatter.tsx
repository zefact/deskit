import { useDeferredValue, useMemo, useState } from "react";
import { format, type KeywordCase, type SqlLanguage } from "sql-formatter";
import { InputPane, Opt, OptBar, OutputPane, Segmented, Select } from "../components/ui";
import { errorMessage, PaneFoot, SampleButton } from "./common";

const SAMPLE =
  "select u.id, u.name, count(o.id) as order_count, sum(o.total) total from users u left join orders o on o.user_id = u.id and o.status in ('paid','shipped') where u.created_at >= '2026-01-01' group by u.id, u.name having count(o.id) > 3 order by total desc limit 20;";

const DIALECTS: { value: SqlLanguage; label: string }[] = [
  { value: "sql", label: "標準SQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "sqlite", label: "SQLite" },
  { value: "transactsql", label: "SQL Server (T-SQL)" },
  { value: "plsql", label: "Oracle (PL/SQL)" },
  { value: "bigquery", label: "BigQuery" },
  { value: "snowflake", label: "Snowflake" },
  { value: "redshift", label: "Redshift" },
];

export default function SqlFormatter() {
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<SqlLanguage>("mysql");
  const [keywordCase, setKeywordCase] = useState<KeywordCase>("upper");
  const [indent, setIndent] = useState<"2" | "4" | "tab">("2");
  const deferred = useDeferredValue(input);

  const result = useMemo(() => {
    if (deferred.trim() === "") return { out: "" };
    try {
      return {
        out: format(deferred, {
          language,
          keywordCase,
          tabWidth: indent === "4" ? 4 : 2,
          useTabs: indent === "tab",
          linesBetweenQueries: 2,
        }),
      };
    } catch (e) {
      return { out: "", error: errorMessage(e).split("\n")[0] };
    }
  }, [deferred, language, keywordCase, indent]);

  return (
    <>
      <OptBar>
        <Opt label="方言">
          <Select value={language} onChange={setLanguage} options={DIALECTS} />
        </Opt>
        <Opt label="キーワード">
          <Segmented<KeywordCase>
            value={keywordCase}
            onChange={setKeywordCase}
            options={[
              { value: "upper", label: "大文字" },
              { value: "lower", label: "小文字" },
              { value: "preserve", label: "そのまま" },
            ]}
          />
        </Opt>
        <Opt label="インデント">
          <Segmented
            value={indent}
            onChange={setIndent}
            options={[
              { value: "2", label: "2" },
              { value: "4", label: "4" },
              { value: "tab", label: "タブ" },
            ]}
          />
        </Opt>
      </OptBar>
      <div className="split">
        <InputPane
          title="SQL"
          value={input}
          onChange={setInput}
          lang="sql"
          placeholder="SQL を入力または貼り付け"
          extra={<SampleButton onClick={() => setInput(SAMPLE)} />}
          footer={result.error && <PaneFoot kind="error">{result.error}</PaneFoot>}
        />
        <OutputPane title="整形結果" value={result.out} lang="sql" />
      </div>
    </>
  );
}
