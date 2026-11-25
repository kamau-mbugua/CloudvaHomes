# google_mlkit_text_recognition declares non-Latin script recognisers as compileOnly;
# KodiHQ bundles only the Latin script recogniser.
-dontwarn com.google.mlkit.vision.text.chinese.**
-dontwarn com.google.mlkit.vision.text.devanagari.**
-dontwarn com.google.mlkit.vision.text.japanese.**
-dontwarn com.google.mlkit.vision.text.korean.**
