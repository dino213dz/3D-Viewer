# 3D Viewer

Visualiseur 3D web pour modèles **FBX / glTF / GLB / ZIP**.

| | |
|---|---|
| **Version** | 1.7.9 |
| **Création** | 19 août 2026 |
| **Dernière MAJ** | 20 août 2026 |
| **Auteur** | CHORFA Allaeddine |
| **Site** | [chorfa.fr](https://chorfa.fr) |
| **Contact** | [webmaster@chorfa.fr](mailto:webmaster@chorfa.fr) |
| **GitHub** | [dino213dz/3D-Viewer](https://github.com/dino213dz/3D-Viewer) |

Archive de déploiement : **`3DViewer_179.zip`** (format `3DViewer_xyz` sans points dans le numéro de version).

---

## Fonctionnalités (v1.7.9)

- Menu style macOS : **Fichier**, **Éditer**, **Vue**, **Aide**, **À propos**
- Chargement via **Fichier → Charger un fichier** (fenêtre glisser-déposer + parcourir)
- Modèle par défaut `4x4.glb`
- Éditeur de matériaux (couleur, metalness, roughness, alpha, transmission, emissive, texture, échelle UV)
- Réinitialisation des matériaux d’origine
- Lumières Ambient / Directional / Point / Spot
- **Annuler / Refaire** illimité (par fichier, session)
- Wireframe, cadrage objet, cadrage zone visible
- Panneaux flottants, transparence 66 %, accent `#6761FF`
- Sauvegarde auto des préférences (matériaux + vue) par fichier
- Navigation souris et tactile
- Propriétés du fichier (polygones, matériaux, dimensions)
- Raccourcis barre : Matériaux, Lumières, Annuler, Refaire, Cadrer

---

## Historique des versions

### 1.7.9
- README : historique complet systématiquement à jour
- Bulles (tooltips) sur les boutons de la barre de menu
- Liens À propos : plus de blanc forcé sur `:visited` (monochrome + survol accent)
- Boutons Matériaux / Lumières : **vert Xbox** uniquement lorsque la fenêtre correspondante est ouverte

### 1.7.8
- Boutons barre Matériaux / Lumières : toggle ouvrir/fermer
- À propos : icônes globe / mail / GitHub monochromes

### 1.7.7
- Lien GitHub dans À propos
- Raccourcis barre : Matériaux et Lumières

### 1.7.6
- Menu : un seul sous-menu ouvert à la fois (plus de clic + survol simultanés)

### 1.7.5
- Aide : raccourcis clavier + icône « ? »
- Accent `#6761FF` ; feux de fenêtre monochromes
- Vue → Propriétés du fichier
- Panneau latéral : plus de panneau vide (props par défaut / dernière fenêtre)

### 1.7.4
- Historique Annuler/Refaire **par fichier** (compteur non hérité entre fichiers)

### 1.7.3
- Correction cadrage zone visible : objet à côté des fenêtres (pas derrière)

### 1.7.2
- Repositionnement des fenêtres paysage (haut-gauche) / portrait (bas)
- Cadrer zone visible (menu Vue + barre)

### 1.7.1
- Fix application matériau (2e modification)
- Refaire / Redo (menu + barre + Ctrl+Y)
- Couleurs personnalisées enregistrées + champ hex

### 1.7.0
- Correction bouton Annuler (menu + barre)
- Icônes SVG monochromes blanches
- Bouton barre : recadrer la vue
- Échelle texture X/Y/Z
- Menu Vue : suppression de « Recentrer la caméra »

### 1.6.9
- Correction critique : erreur de syntaxe dans `performUndo` (script JS ne se chargeait plus)

### 1.6.8
- Menu réordonné : Fichier → Éditer → Vue → Aide → À propos
- Icônes menu + bouton Annuler à droite de la barre
- Correction : modif. lumières ne réinitialise plus les matériaux

### 1.6.7
- Menu **Éditer** (remplace Paramètres + Matériaux)
- Historique **Annuler** illimité + Ctrl/Cmd+Z

### 1.6.6
- Transparence des fenêtres / menus à **66 %**

### 1.6.5
- Aucune fenêtre ouverte au démarrage

### 1.6.4
- Fenêtre **Charger un fichier** (glisser-déposer + Parcourir)
- Transparence glass ~85 %

### 1.6.3
- Réinitialiser matériaux d’origine

### 1.6.2
- Chargement fichier uniquement via menu Fichier

### 1.6.1
- Auteur : CHORFA Allaeddine
- Modèle par défaut **4x4.glb**

### 1.6.0
- Fenêtres glass flottantes (déplacer, redimensionner, min/max)
- Menu se ferme au clic sur une action

### 1.5.x
- Menu responsive, conservation de la sélection matériau
- Barre de titre Mac (feux + croix)

### 1.4.x – 1.2.x
- Panneau matériaux, auto-scale, menu horizontal macOS
- Lumières configurables, wireframe, cadrage
- Support ZIP / FBX / glTF, OrbitControls souris + tactile

### 1.0 – 1.1
- Première version du visualiseur 3D web (Car3D Tester → 3D Viewer)

---

## Déploiement (Netlify Drop)

1. Télécharger **`3DViewer_179.zip`**
2. Déposer sur [Netlify Drop](https://app.netlify.com/drop)
3. Vider le cache navigateur après mise à jour

## Lancer en local

```bash
cd car3d-app
python3 -m http.server 8080
```

Fichiers : `index.html`, `main.js`, `style.css`, `4x4.glb`.

---

## Formats supportés

| Extension | Notes |
|-----------|--------|
| `.glb` / `.gltf` | glTF 2.0 |
| `.fbx` | FBXLoader |
| `.zip` | archive FBX/glTF + textures |

---

© 2026 CHORFA Allaeddine — [chorfa.fr](https://chorfa.fr) — [GitHub](https://github.com/dino213dz/3D-Viewer)
