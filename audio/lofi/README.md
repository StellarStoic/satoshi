# Block Lo-Fi instrument samples

The complete web-ready MP3 sample collection comes from
[`nbrosowsky/tonejs-instruments`](https://github.com/nbrosowsky/tonejs-instruments)
at commit `622c2f1c32c8cfce4158ddc3eb26e518ddef37e5` and is licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

Attribution: the tonejs-instruments contributors and the original sample authors
catalogued in [`instruments/sample-source-info.txt`](instruments/sample-source-info.txt),
including Karoryfer, Versilian Studios/VSO2, the University of Iowa, and named
Freesound contributors. The upstream MIT license is retained at
[`instruments/LICENSE.md`](instruments/LICENSE.md).

All 449 MP3 notes across the upstream library's 20 instruments are bundled.
WAV and OGG duplicates are omitted because the site plays MP3 assets. The app
loads only the instruments selected for the current block, and the service
worker caches samples as they are used instead of precaching the 81 MB bank.
