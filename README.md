# 3D Viewer

Visualiseur 3D web pour modèles **FBX / glTF / GLB / ZIP**.

| | |
|---|---|
| **Version** | 1.7.2 |
| **Création** | 19 août 2026 |
| **Dernière MAJ** | 20 août 2026 |
| **Auteur** | CHORFA Allaeddine |
| **Site** | [chorfa.fr](https://chorfa.fr) |
| **Contact** | [webmaster@chorfa.fr](mailto:webmaster@chorfa.fr) |

Archive de déploiement : **`3DViewer_172.zip`** (format `3DViewer_xyz` sans points dans le numéro de version).

---

## Fonctionnalités (v1.7.2)

- Menu style macOS : **Fichier**, **Éditer**, **Vue**, **Aide**, **À propos**
- Chargement via **Fichier → Charger un fichier** (fenêtre glisser-déposer + parcourir)
- Modèle par défaut `4x4.glb`
- Éditeur de matériaux (couleur, metalness, roughness, alpha, transmission, emissive, texture)
- Réinitialisation des matériaux d’origine
- Lumières Ambient / Directional / Point / Spot (ajout, édition, suppression)
- **Annuler** illimité (matériaux + lumières) — menu Éditer + bouton ↩️ + Ctrl/Cmd+Z
- Wireframe, cadrage objet, recentrage caméra, auto-scale
- Panneaux flottants (drag / resize / min / max), transparence 66 %
- Sauvegarde auto des préférences (matériaux + vue) par fichier
- Navigation souris et tactile

---

## Historique des versions

### 1.7.2
- Correction critique : erreur de syntaxe dans `performUndo` (script JS ne se chargeait plus → menus/boutons inactifs)

### 1.6.8
- Menu réordonné : Fichier → **Éditer** → Vue → Aide → À propos
- Icônes sur les entrées de menu
- Bouton **Annuler** (icône ↩️) à droite de la barre de menu
- Correction : modification des lumières ne réinitialise plus les matériaux

### 1.6.7
- Menu **Éditer** (remplace Paramètres + Matériaux)
- Historique **Annuler** illimité (matériaux, ajout/suppression/modif. lumières)
- Raccourci Ctrl/Cmd+Z

### 1.6.6
- Transparence des fenêtres / menus réglée à **66 %**

### 1.6.5
- Aucune fenêtre ouverte au démarrage

### 1.6.4
- Fenêtre **Charger un fichier** (glisser-déposer + Parcourir + fermeture)
- Transparence glass ~85 % (menu, panneaux, modales)

### 1.6.3
- Bouton **Réinitialiser matériaux d’origine**
- Snapshot des matériaux à chaque chargement de fichier

### 1.6.2
- Chargement fichier **uniquement** via le menu (drop zone panneau retirée)

### 1.6.1
- Auteur dans À propos : **CHORFA Allaeddine**
- Modèle par défaut **4x4.glb**

### 1.6.0
- Fenêtres glass flottantes (déplacer, redimensionner, min/max)
- Menu se ferme au clic sur une action
- Feux de fenêtre style Mac

### 1.5.x
- Menu responsive, conservation de la sélection matériau après application
- Barre de titre Mac (feux + croix)

### 1.4.x – 1.2.x
- Panneau matériaux, auto-scale, versioning, menu horizontal macOS
- Voiture démo, lumières configurables, wireframe, cadrage
- Support ZIP / FBX / glTF, OrbitControls souris + tactile

### 1.0 – 1.1
- Première version du visualiseur 3D web (Car3D Tester → 3D Viewer)

---

## Déploiement (Netlify Drop)

1. Télécharger **`3DViewer_172.zip`**
2. Déposer le ZIP sur [Netlify Drop](https://app.netlify.com/drop) (ou extraire puis glisser le dossier)
3. Vider le cache navigateur après mise à jour

## Lancer en local

```bash
cd car3d-app
python3 -m http.server 8080
```

Ouvrir `http://localhost:8080`

Fichiers à la racine du site : `index.html`, `main.js`, `style.css`, `4x4.glb`.

---

## Formats supportés

| Extension | Notes |
|-----------|--------|
| `.glb` / `.gltf` | glTF 2.0 |
| `.fbx` | via FBXLoader |
| `.zip` | archive contenant FBX/glTF + textures |

---

© 2026 CHORFA Allaeddine — [chorfa.fr](https://chorfa.fr)
