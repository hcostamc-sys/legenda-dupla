package ci;

import io.github.hcostamcsys.legendadupla.voz.MixadorVoz;
import io.github.hcostamcsys.legendadupla.voz.ModeloOnnx;
import io.github.hcostamcsys.legendadupla.voz.ObterAudio;
import io.github.hcostamcsys.legendadupla.voz.SeparadorVoz;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Prova no GitHub Actions:
 *   modelo ARQ.onnx ENTRADA.wav VOZ.wav MIX.wav MARGEM  → separa, mede o tempo, mixa com a margem
 *   youtube ID [baixar]                                  → lista os áudios do vídeo e (opcional) baixa o escolhido
 * WAV: PCM 16 bits, 44,1 kHz, estéreo.
 */
public class ProvaVoz {

    public static void main(String[] a) throws Exception {
        if (a.length >= 6 && a[0].equals("modelo")) {
            modelo(a[1], a[2], a[3], a[4], Float.parseFloat(a[5]));
        } else if (a.length >= 2 && a[0].equals("youtube")) {
            youtube(a[1], a.length > 2 && a[2].equals("baixar"));
        } else {
            System.out.println("uso: modelo ARQ ENTRADA VOZ MIX MARGEM | youtube ID [baixar]");
            System.exit(2);
        }
    }

    static void youtube(String id, boolean baixar) throws Exception {
        ObterAudio.iniciar("BR");
        long t0 = System.nanoTime();
        for (String s : ObterAudio.listar(id)) System.out.println("  áudio: " + s);
        ObterAudio.Escolha e = ObterAudio.escolher(id);
        System.out.printf("escolhido (%.1f s): %s%n", (System.nanoTime() - t0) / 1e9, e);
        if (!baixar) return;
        File f = new File("audio-" + id + "." + e.formato);
        f.delete();
        long t1 = System.nanoTime();
        long[] ultimo = {0};
        ObterAudio.baixar(e, f, (feitos, total) -> {
            if (feitos - ultimo[0] > 1_000_000 || feitos == total) {
                System.out.printf("  baixando %d de %d%n", feitos, total);
                ultimo[0] = feitos;
            }
            return true;
        });
        double s = (System.nanoTime() - t1) / 1e9;
        System.out.printf("baixado: %d bytes em %.1f s (%.0f kB/s)%n", f.length(), s, f.length() / 1024.0 / s);
        if (e.tamanho > 0 && f.length() != e.tamanho) throw new IllegalStateException("tamanho diferente do informado");
    }

    static void modelo(String onnx, String entrada, String saidaVoz, String saidaMix, float margem) throws Exception {
        float[][] x = lerWav(new File(entrada));
        int len = x[0].length;
        long t0 = System.nanoTime();
        ModeloOnnx m = new ModeloOnnx(onnx, 4);
        System.out.printf("modelo carregado em %.1f s: %s%n", (System.nanoTime() - t0) / 1e9, m.descricao());
        float[][] voz = new float[2][len], fundo = new float[2][len];
        int[] pos = {0};
        MixadorVoz.Medidor medidor = new MixadorVoz.Medidor(44100);
        long[] trechos = {0};
        SeparadorVoz s = new SeparadorVoz(m, (vE, vD, fE, fD, q) -> {
            System.arraycopy(vE, 0, voz[0], pos[0], q);
            System.arraycopy(vD, 0, voz[1], pos[0], q);
            System.arraycopy(fE, 0, fundo[0], pos[0], q);
            System.arraycopy(fD, 0, fundo[1], pos[0], q);
            medidor.medir(vE, vD, fE, fD, q);
            pos[0] += q;
            trechos[0]++;
        });
        long t1 = System.nanoTime();
        int bloco = 44100;
        for (int i = 0; i < len; i += bloco) s.adicionar(x[0], x[1], i, Math.min(bloco, len - i));
        s.terminar();
        double seg = (System.nanoTime() - t1) / 1e9;
        double dur = len / 44100.0;
        System.out.printf("separação: %.1f s de áudio em %.1f s (%.2f s por segundo de áudio; %.1f s por trecho de 7,8 s)%n",
                dur, seg, seg / dur, seg / Math.max(1, Math.ceil((len - ModeloOnnx.TRECHO) / (0.75 * ModeloOnnx.TRECHO)) + 1));
        if (pos[0] != len) throw new IllegalStateException("tamanho de saída " + pos[0] + " != " + len);
        m.close();
        MixadorVoz.Niveis nv = medidor.terminar();
        float[] g = MixadorVoz.ganhos(nv, margem, 44100);
        float menor = 0;
        int abaixados = 0;
        for (float v : g) {
            menor = Math.min(menor, v);
            if (v < -1f) abaixados++;
        }
        System.out.printf("ganho do fundo: menor %.1f dB; %d de %d quadros abaixados%n", menor, abaixados, g.length);
        float[][] mix = new float[2][len];
        new MixadorVoz.Aplicador(g).misturar(voz[0], voz[1], fundo[0], fundo[1], mix[0], mix[1], len);
        escreverWav(new File(saidaVoz), voz);
        escreverWav(new File(saidaMix), mix);
    }

    static float[][] lerWav(File f) throws IOException {
        byte[] tudo;
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            tudo = b.toByteArray();
        }
        ByteBuffer bb = ByteBuffer.wrap(tudo).order(ByteOrder.LITTLE_ENDIAN);
        int p = 12, canais = 0, taxa = 0, bits = 0, ini = -1, tam = 0;
        while (p + 8 <= tudo.length) {
            String id = new String(tudo, p, 4, "US-ASCII");
            int t = bb.getInt(p + 4);
            if (id.equals("fmt ")) {
                canais = bb.getShort(p + 10);
                taxa = bb.getInt(p + 12);
                bits = bb.getShort(p + 22);
            } else if (id.equals("data")) {
                ini = p + 8;
                tam = t;
                break;
            }
            p += 8 + t + (t & 1);
        }
        if (ini < 0 || canais != 2 || taxa != 44100 || bits != 16) {
            throw new IOException("WAV precisa ser 16 bits, 44,1 kHz, estéreo (veio " + canais + " canais, " + taxa + " Hz, " + bits + " bits)");
        }
        int n = tam / 4;
        float[][] x = new float[2][n];
        for (int i = 0; i < n; i++) {
            x[0][i] = bb.getShort(ini + 4 * i) / 32768f;
            x[1][i] = bb.getShort(ini + 4 * i + 2) / 32768f;
        }
        return x;
    }

    static void escreverWav(File f, float[][] x) throws IOException {
        int n = x[0].length;
        ByteBuffer bb = ByteBuffer.allocate(44 + 4 * n).order(ByteOrder.LITTLE_ENDIAN);
        bb.put("RIFF".getBytes("US-ASCII")).putInt(36 + 4 * n).put("WAVE".getBytes("US-ASCII"));
        bb.put("fmt ".getBytes("US-ASCII")).putInt(16).putShort((short) 1).putShort((short) 2)
                .putInt(44100).putInt(44100 * 4).putShort((short) 4).putShort((short) 16);
        bb.put("data".getBytes("US-ASCII")).putInt(4 * n);
        for (int i = 0; i < n; i++) {
            bb.putShort((short) Math.max(-32768, Math.min(32767, Math.round(x[0][i] * 32767))));
            bb.putShort((short) Math.max(-32768, Math.min(32767, Math.round(x[1][i] * 32767))));
        }
        try (OutputStream o = new FileOutputStream(f)) {
            o.write(bb.array());
        }
    }
}
