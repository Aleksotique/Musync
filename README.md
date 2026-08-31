# Musique Hors Ligne

App web personnelle (PWA) pour écouter de la musique déjà téléchargée,
sans connexion internet, avec playlists et contrôles depuis l'écran verrouillé.

Tout est stocké en local sur le téléphone (IndexedDB) : aucun fichier
n'est envoyé à un serveur. L'hébergement web sert uniquement à livrer
le code de l'app à Safari.

## Mise en ligne (nécessaire pour l'installer sur iPhone)

iOS exige une adresse en HTTPS pour autoriser le mode "hors ligne" et
l'ajout à l'écran d'accueil. Le plus simple, gratuit, sans Mac :

### Option A — GitHub Pages
1. Crée un dépôt GitHub (public ou privé) et mets-y tout le contenu de
   ce dossier (à la racine du dépôt, pas dans un sous-dossier).
2. Dans le dépôt : Settings → Pages → Source → sélectionne la branche
   `main` et le dossier `/root`, puis Save.
3. Après une minute ou deux, l'app est disponible à l'adresse indiquée
   (du type `https://tonpseudo.github.io/ton-repo/`).

### Option B — Netlify Drop (encore plus rapide)
1. Va sur https://app.netlify.com/drop
2. Glisse-dépose ce dossier entier dans la page.
3. Une adresse HTTPS est générée immédiatement.

## Installation sur l'iPhone 12
1. Ouvre l'adresse HTTPS obtenue ci-dessus dans Safari (pas Chrome).
2. Appuie sur le bouton Partager, puis "Sur l'écran d'accueil".
3. L'app apparaît avec son icône (équaliseur blanc sur fond noir).
   Lance-la depuis cette icône pour bénéficier du mode plein écran et
   du fonctionnement hors ligne.

## Utilisation
- Onglet Bibliothèque → "Importer des musiques" pour choisir des
  fichiers audio déjà présents sur le téléphone (Fichiers, iCloud, etc.).
- Le titre/artiste/pochette sont lus automatiquement depuis les
  informations du fichier (tags ID3) quand elles existent.
- Onglet Playlists → "Nouvelle playlist", puis "Ajouter des musiques"
  dans une playlist pour y piocher dans la bibliothèque.
- Une fois un morceau lancé, les contrôles (lecture/pause/suivant/
  précédent) restent disponibles depuis l'écran verrouillé.

## Limite à connaître
Safari sur iOS peut, dans de rares cas (mémoire faible, app en fond
depuis très longtemps), couper la lecture en arrière-plan — une
limite du web sur iOS, pas de l'app elle-même. Rouvrir l'app resynchronise
tout de suite les contrôles.
