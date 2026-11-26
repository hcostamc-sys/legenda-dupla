package io.github.hcostamcsys.legendadupla.voz;

/**
 * Cadeia completa da limpeza da voz separada, na taxa do app (44,1 kHz), em fluxo:
 *   voz → 48 kHz → eco (Dereverberador, WPE) → ruído (LimpadorVoz, DeepFilterNet3) → taxa original.
 * Mesma ordem, mesmo número de amostras e sem atraso: a voz limpa continua alinhada com o fundo.
 * modelo null: só tira o eco; eco false: só tira o ruído (para testes e diagnóstico).
 * Java puro (sem Android).
 */
public final class LimpezaVoz implements AutoCloseable {

    /** Blocos: 15 s para a rede e o WPE; 3 s de aquecimento da rede (medido: igual ao áudio inteiro de uma vez). */
    public static final int BLOCO_REDE = 1500, AQUECIMENTO = 300, BLOCO_ECO = 1875;

    private final int taxa;
    private final LimpadorVoz.Saida saida;
    private final Reamostrador subirE, subirD, descerE, descerD;
    private final Dereverberador eco;
    private final LimpadorVoz ruido;
    private long recebidas = 0, entregues = 0;
    private float[] bE = new float[0], bD = new float[0], cE = new float[0], cD = new float[0];

    public LimpezaVoz(ModeloLimpeza modelo, boolean tirarEco, int taxa, int threads, LimpadorVoz.Saida saida) {
        this.taxa = taxa;
        this.saida = saida;
        boolean reamostrar = taxa != LimpadorVoz.TAXA;
        subirE = reamostrar ? new Reamostrador(taxa, LimpadorVoz.TAXA) : null;
        subirD = reamostrar ? new Reamostrador(taxa, LimpadorVoz.TAXA) : null;
        descerE = reamostrar ? new Reamostrador(LimpadorVoz.TAXA, taxa) : null;
        descerD = reamostrar ? new Reamostrador(LimpadorVoz.TAXA, taxa) : null;
        LimpadorVoz.Saida fim = this::descer;
        ruido = modelo == null ? null : new LimpadorVoz(modelo, BLOCO_REDE, AQUECIMENTO, fim);
        LimpadorVoz r = ruido;
        LimpadorVoz.Saida depoisEco = r == null ? fim : (e, d, n) -> r.adicionar(e, d, 0, n);
        eco = tirarEco ? new Dereverberador(BLOCO_ECO, threads, depoisEco) : null;
    }

    public long entregues() {
        return entregues;
    }

    public void adicionar(float[] esq, float[] dir, int ini, int n) throws Exception {
        recebidas += n;
        if (subirE == null) {
            primeiro(esq, dir, ini, n);
            return;
        }
        int cap = (int) Math.ceil(n * (double) LimpadorVoz.TAXA / taxa) + 4;
        if (bE.length < cap) {
            bE = new float[cap];
            bD = new float[cap];
        }
        int q = subirE.processar(esq, ini, n, bE);
        int q2 = subirD.processar(dir, ini, n, bD);
        if (q != q2) throw new IllegalStateException("reamostragem");
        if (q > 0) primeiro(bE, bD, 0, q);
    }

    private void primeiro(float[] e, float[] d, int ini, int n) throws Exception {
        if (eco != null) {
            eco.adicionar(e, d, ini, n);
        } else if (ruido != null) {
            ruido.adicionar(e, d, ini, n);
        } else {
            descer(slice(e, ini, n), slice(d, ini, n), n);
        }
    }

    private static float[] slice(float[] x, int ini, int n) {
        if (ini == 0) return x;
        float[] o = new float[n];
        System.arraycopy(x, ini, o, 0, n);
        return o;
    }

    public void terminar() throws Exception {
        if (subirE != null) {
            float[] e = new float[4096], d = new float[4096];
            int q = subirE.terminar(e);
            int q2 = subirD.terminar(d);
            if (q != q2) throw new IllegalStateException("reamostragem");
            if (q > 0) primeiro(e, d, 0, q);
        }
        if (eco != null) eco.terminar();
        if (ruido != null) ruido.terminar();
        if (descerE != null) {
            float[] e = new float[4096], d = new float[4096];
            int q = descerE.terminar(e);
            descerD.terminar(d);
            entregar(e, d, q);
        }
        // Se faltou alguma amostra (arredondamento da reamostragem), completa com silêncio
        long falta = recebidas - entregues;
        if (falta > 0) {
            float[] z = new float[(int) Math.min(falta, Integer.MAX_VALUE)];
            entregar(z, z, z.length);
        }
    }

    private void descer(float[] e, float[] d, int n) throws Exception {
        if (descerE == null) {
            entregar(e, d, n);
            return;
        }
        int cap = (int) Math.ceil(n * (double) taxa / LimpadorVoz.TAXA) + 4;
        if (cE.length < cap) {
            cE = new float[cap];
            cD = new float[cap];
        }
        int q = descerE.processar(e, 0, n, cE);
        int q2 = descerD.processar(d, 0, n, cD);
        if (q != q2) throw new IllegalStateException("reamostragem");
        entregar(cE, cD, q);
    }

    private void entregar(float[] e, float[] d, int n) throws Exception {
        int q = (int) Math.min(n, recebidas - entregues); // nunca mais que o que entrou
        if (q <= 0) return;
        saida.entregar(e, d, q);
        entregues += q;
    }

    @Override
    public void close() {
        if (eco != null) eco.close();
    }
}
