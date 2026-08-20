# 3D Viewer

Visualiseur 3D web pour modèles **FBX / glTF / GLB / ZIP**.

| | |
|---|---|
| **Version** | 2.0.0 |
| **Création** | 19 août 2026 |
| **Dernière MAJ** | 20 août 2026 |
| **Auteur** | CHORFA Allaeddine |
| **Site** | [chorfa.fr](https://chorfa.fr) |
| **Contact** | [webmaster@chorfa.fr](mailto:webmaster@chorfa.fr) |
| **GitHub** | [dino213dz/3D-Viewer](https://github.com/dino213dz/3D-Viewer) |

Archive de déploiement : **`3DViewer_200.zip`**

---

## Fonctionnalités (v2.0.0)

- Menu style macOS + barre d’outils (Matériaux, Lumières, Annuler, Refaire, Cadrer)
- Chargement FBX / GLB / GLTF / ZIP (menu Fichier)
- Matériaux triés **alphabétiquement** et numérotés (`1-Nom`, `2-Nom`…)
- **Clic sur l’objet** → bulle avec le nom du matériau + sélection dans l’éditeur
- Lumières, wireframe, cadrage, zone visible, auto-scale
- Annuler / Refaire (historique par fichier)
- Panneaux flottants, accent `#6761FF`
- Propriétés du fichier, préférences auto
- À propos : logo GitHub **dino213dz**

---

## Historique des versions

### 2.0.0 *(majeure)*
- Icônes barre actives : **bleu accent** (plus de vert)
- Matériaux : ordre alphabétique + numérotation `N-Nom`
- Clic 3D → bulle nom du matériau
- Logo **dino213dz** dans la fenêtre À propos

### 1.7.9
- README historique complet
- Bulles tooltips barre de menu
- Liens visités corrigés ; vert réservé aux fenêtres actives (remplacé en 2.0.0 par bleu)

### 1.7.8
- Toggle Matériaux / Lumières
- Icônes globe / mail / GitHub dans À propos

### 1.7.7
- Lien GitHub ; raccourcis barre Matériaux / Lumières

### 1.7.6
- Un seul sous-menu ouvert à la fois

### 1.7.5
- Raccourcis clavier dans Aide ; accent `#6761FF`
- Propriétés du fichier ; panneau non vide

### 1.7.4
- Historique Annuler/Refaire par fichier

### 1.7.3
- Cadrage zone visible corrigé

### 1.7.2
- Layout paysage / portrait ; cadrage zone visible

### 1.7.1
- Fix 2e application matériau ; Redo ; couleurs perso + hex

### 1.7.0
- Icônes SVG ; échelle texture ; recadrage barre

### 1.6.9 – 1.6.0
- Stabilisation menus, glass UI, chargement menu-only, 4x4.glb, auteur

### 1.5.x – 1.0
- Premières versions (Car3D Tester → 3D Viewer)

---

## Déploiement

1. Télécharger **`3DViewer_200.zip`**
2. Déposer sur Netlify Drop
3. Vider le cache navigateur

## Local

```bash
python3 -m http.server 8080
```

Fichiers : `index.html`, `main.js`, `style.css`, `4x4.glb`, `logo-dino213dz.png`

---

© 2026 CHORFA Allaeddine — [chorfa.fr](https://chorfa.fr) — [GitHub](https://github.com/dino213dz/3D-Viewer)
