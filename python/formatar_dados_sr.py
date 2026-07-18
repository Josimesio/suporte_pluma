import pandas as pd
import re
from datetime import datetime, timedelta
import pytz
import sys
import os

# =========================
# CONFIG
# =========================
TZ_SP = pytz.timezone("America/Sao_Paulo")

# =========================
# FUNÇÕES DE PARSE
# =========================
def parse_oracle_date(val, base):
    if pd.isna(val):
        return ""

    s = str(val).strip().strip('"')
    if not s:
        return ""

    s = re.sub(r"\s+", " ", s)

    # Today / Yesterday no formato Oracle, exemplo:
    # Today 2:18 PM / Yesterday 6:59 PM
    m = re.match(r"^(Today|Yesterday)\s+(\d{1,2}):(\d{2})\s*(AM|PM)$", s, re.IGNORECASE)
    if m:
        day, hh, mm, ap = m.groups()
        hh, mm = int(hh), int(mm)

        if ap.upper() == "PM" and hh != 12:
            hh += 12
        if ap.upper() == "AM" and hh == 12:
            hh = 0

        d = base.date()
        if day.lower() == "yesterday":
            d = (base - timedelta(days=1)).date()

        return datetime(d.year, d.month, d.day, hh, mm).strftime("%Y-%m-%d %H:%M")

    # Today / Yesterday caso venha sem AM/PM, em 24h
    m = re.match(r"^(Today|Yesterday)\s+(\d{1,2}):(\d{2})$", s, re.IGNORECASE)
    if m:
        day, hh, mm = m.groups()
        d = base.date()
        if day.lower() == "yesterday":
            d = (base - timedelta(days=1)).date()

        return datetime(d.year, d.month, d.day, int(hh), int(mm)).strftime("%Y-%m-%d %H:%M")

    # formatos comuns
    for fmt in [
        "%m/%d/%Y %I:%M %p",
        "%m/%d/%Y %H:%M",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ]:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d %H:%M")
        except Exception:
            pass

    dt = pd.to_datetime(s, errors="coerce")
    if pd.isna(dt):
        return ""

    return dt.to_pydatetime().strftime("%Y-%m-%d %H:%M")


def parse_created(val, base):
    return parse_oracle_date(val, base)


def parse_updated(val, base):
    return parse_oracle_date(val, base)


# =========================
# MAIN
# =========================
def main(arquivo_entrada, arquivo_saida):
    df = pd.read_csv(arquivo_entrada)
    df.columns = [c.strip() for c in df.columns]

    agora_sp = datetime.now(TZ_SP)

    # detectar coluna SR
    sr_col = None
    for c in ["SR Number", "SRNumber", "SR", "SR#"]:
        if c in df.columns:
            sr_col = c
            break

    out = pd.DataFrame({
        "Número SR": df[sr_col] if sr_col else "",
        "Serviço": df.get("Service"),
        "Issue Type": df.get("Issue Type"),
        "Status": df.get("Status"),
        "Severidade": df.get("Severity"),
        "Criado_dt": df.get("Created").apply(lambda x: parse_created(x, agora_sp)),
        "Atualizado_dt": df.get("Updated").apply(lambda x: parse_updated(x, agora_sp)),
        "Contato Primário": df.get("Primary Contact"),
        "Gerado em": agora_sp.strftime("%d/%m/%Y %H:%M"),
    })

    out.to_csv(arquivo_saida, index=False, encoding="utf-8-sig")
    print(f"✅ Arquivo gerado com sucesso: {arquivo_saida}")
    print(f"📊 Registros: {len(out)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso:")
        print("python formatar_dados_sr.py <arquivo_entrada.csv> <arquivo_saida.csv>")
        sys.exit(1)

    entrada = sys.argv[1]
    saida = sys.argv[2]

    if not os.path.exists(entrada):
        print(f"❌ Arquivo não encontrado: {entrada}")
        sys.exit(1)

    main(entrada, saida)



    #++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    #COMO USAR : 
    # python formatar_dados_sr.py MOSSrSearchExport_2026.csv dados_sr_2026_formatado.csv
    # Python {script}             {ARquivo bruto}            {Arquivo de Saida}
    #=====================================================================================