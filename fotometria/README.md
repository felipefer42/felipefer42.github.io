# Laboratório de Fotometria

Atividade interativa, inteiramente local, para introduzir filtros fotométricos e magnitudes sintéticas nos sistemas AB e Vega.

## Como abrir

Na pasta do projeto, execute:

```powershell
python -m http.server 8000
```

Depois abra `http://localhost:8000` no navegador. O servidor local é necessário para que os atalhos carreguem automaticamente os arquivos Gaia das pastas `Espectros` e `Filtros`. A atividade não envia nenhum dado para a internet.

## Formato de arquivos próprios

Use CSV, TXT ou DAT com duas colunas numéricas:

- espectro: comprimento de onda em **nm** e `Fλ` em **W m⁻² nm⁻¹**;
- transmissão: comprimento de onda em **nm** (ou Å, detectado automaticamente) e transmissão entre 0–1 (ou em porcentagem).

Linhas de cabeçalho são ignoradas.

Os seletores de espectro e filtro aceitam vários arquivos de uma vez. Todas as
curvas carregadas ficam disponíveis no seletor; a curva ativa é usada no cálculo
e aparece destacada no gráfico correspondente.

Além do corpo negro e dos arquivos carregados, a fonte pode ser um espectro
constante em `fν = 3631 Jy`. Essa é a referência de magnitude zero do sistema AB
e deve produzir `mAB = 0` para qualquer passband válida.

O seletor de calibração alterna entre os sistemas AB e Vega. O gráfico da fonte
mostra também o espectro de referência ativo: `fν = 3631 Jy` no sistema AB ou o
espectro CALSPEC de Vega no sistema Vega. O arquivo local
`Espectros/Vega/vega_calspec.csv` foi derivado de
`alpha_lyr_stis_012.fits`, distribuído pelo
[CALSPEC/MAST](https://archive.stsci.edu/hlsps/reference-atlases/cdbs/current_calspec/).

Também há um corpo negro com linhas de absorção gaussianas idealizadas. Os
controles permitem alterar a profundidade e a largura FWHM de Ca H&K, Hγ, Hβ,
Mg, Na e Hα. Esse modelo tem finalidade didática e não pretende representar uma
atmosfera estelar realista.

## Painéis

A fonte, `S(λ)`, o filtro, o instrumento, a atmosfera e a eficiência do detector
são mostrados em faixas separadas, todas com o mesmo intervalo de comprimento de
onda. O painel `S(λ)` exibe o produto das transmissões que estão ativas.

A interface possui dois modos:

- **Componentes:** permite combinar filtro, instrumento, atmosfera e detector.
  O gráfico de cada componente só aparece quando ele está ativo.
- **Sistema real:** usa uma passband combinada Gaia e mostra apenas a resposta
  total; os componentes separados são ignorados para evitar contagem dupla.

Filtro, instrumento, atmosfera e detector podem usar curvas retangulares,
triangulares ou trapezoidais com parâmetros ajustáveis, além dos modelos
didáticos próprios e de curvas carregadas de arquivos.

Os painéis de atmosfera, instrumento e detector também possuem exemplos do
Vera C. Rubin Observatory, armazenados em `Curvas_Reais/Rubin`. As curvas foram
obtidas do repositório oficial
[`lsst/throughputs`](https://github.com/lsst/throughputs/tree/main/baseline),
release 1.9, e reamostradas em passos de 1 nm:

- atmosfera fiducial do Cerro Pachón a massa de ar 1,2, modelada com MODTRAN e
  aerossóis;
- conjunto óptico calculado como o produto das três curvas de espelho e das três
  curvas de lente, sem filtro, detector ou atmosfera;
- eficiência quântica e revestimento antirreflexo do detector LSSTCam.

O seletor `λ / ν` no painel do espectro alterna todos os gráficos entre
comprimento de onda em nm e frequência em THz. No modo `ν`, o espectro é
convertido de `Fλ` para `Fν` em Jy e as medidas de posição e largura da banda
também são apresentadas em THz. A frequência decresce da esquerda para a direita.
O painel “Intervalo dos gráficos” define, em nm, os limites horizontais
compartilhados por todos os espectros, faixas de cor e curvas de transmissão,
dentro do domínio calculado de 100 a 3000 nm. O eixo vertical do espectro é
reescalado usando somente os fluxos que estão no intervalo visível.

As fitas de cor acima e abaixo do gráfico representam, respectivamente, a fonte
e a luz transmitida pelo sistema. A segunda usa a intensidade `F × S`. Fora do
visível, o fluxo é representado em cinza; baixa intensidade tende ao branco.

## Convenção usada

Para uma resposta total `S(λ)` e um detector que conta fótons:

```text
<fν> = ∫ fλ(λ) S(λ) λ dλ / [c ∫ S(λ) dλ/λ]
mAB = -2.5 log10(<fν> / 3631 Jy)
mVega = -2.5 log10(<fν> / <fν,Vega>)
```

O corpo negro é normalizado fisicamente por raio e distância. As passbands Gaia
fornecidas são tratadas como respostas combinadas do sistema.
