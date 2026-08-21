<p align="center">
  <img src="logo.png" alt="3D Viewer" width="96" height="96" />
</p>

# 3D Viewer

## Description

3D Viewer permet de visualiser vos fichiers 3D.

**Auteur :** CHORFA Allaeddine  
**Site :** [chorfa.fr](https://chorfa.fr)  
**Contact :** [webmaster@chorfa.fr](mailto:webmaster@chorfa.fr)  
**GitHub :** [dino213dz/3D-Viewer](https://github.com/dino213dz/3D-Viewer)  
**Création :** 19 août 2026  
**Dernière mise à jour :** 21 août 2026, 15:30 CEST  
**Version :** 2.1.0

---

## Fonctionnalités de 3D Viewer

### Fonctionnalités globales
- Menu, barre d’outils et panneau flottant
- Annuler / Refaire infini (historique par fichier)
- Compatible FBX / GLB / GLTF / ZIP (contenant les formats précédents)
- Modification de matériaux
- Clic sur l’objet → bulle nom du matériau + sélection dans l’éditeur de matériaux
- Ajout et paramétrage des lumières
- Wireframe, cadrage auto, propriétés du fichier, sauvegarde des modifications (matériaux)

### Autres
- Double-clic sur un élément pour le cadrer
- Gizmo d’axes (X rouge, Y vert, Z bleu)
- Sol : quadrillage, surface plate ou aucun
- Affichage clair / sombre
- Langues : Français, English
- Rotation des lumières, cônes masquables, lumières renommables et repliables

---

## Historique des versions

### 2.1.0 — 21 août 2026, 15:30 CEST
- Textures GLB : conservation et colorSpace corrects (map, normal, roughness, etc.)
- Langues FR / EN (Menu → Fichier → Langues)
- Sous-menus sur une ligne avec troncature « … » + infobulle
- Fichiers renommés : `modele.glb`, `logo.png`
- À propos : logo, description, auteurs, liens
- Propriétés du fichier dans Fichier (+ taille)
- Aide et À propos sous Fichier ; fenêtre Aide dédiée
- Gizmo avec labels X/Y/Z
- Suppression « Appliquer à tout le modèle » du menu Éditer
- Lumières : réduire, renommer, masquer les cônes
- « 3D Viewer » à droite de la barre ; séparateurs menu / icônes
- Fenêtre ouverture : déplaçable, un seul bouton fermer
- Affichage clair (Vue)
- Recharger le modèle par défaut
- « Panneau flottant » (ex. panneau latéral)
- Nom matériau tronqué + en-tête
- Sol : quadrillage / surface / aucun
- Double-clic cadrage élément
- Ascenseurs sombres ; cadres dans le panneau matériaux
- Boutons fenêtre espacés ; barre de titre affinée

### 2.0.3 — 20 août 2026
- Gizmo dans menu Vue
- Sélecteurs de couleur synchronisés avec la valeur courante

### 2.0.2 — 20 août 2026
- Réinitialiser couleur du ciel
- Afficher / masquer les gizmo
- Matériaux regroupés par nom

### 2.0.1 — 20 août 2026
- Fermeture des sous-menus au clic barre
- Rotation des lumières X/Y/Z
- Gizmo d’axes
- Couleur du ciel

### 2.0.0 — 20 août 2026 *(majeure)*
- Icônes actives en bleu accent
- Matériaux alphabétiques numérotés
- Clic 3D → bulle matériau
- Logo dans À propos

### 1.7.9 – 1.7.0 — 20 août 2026
- Tooltips barre, undo par fichier, cadrage zone visible, redo, hex couleurs, icônes SVG

### 1.6.x — 19–20 août 2026
- Menu Éditer, annuler illimité, glass UI 66 %, chargement menu-only, 4x4/modele, auteur

### 1.5.x – 1.0 — 19 août 2026
- Premières versions (Car3D Tester → 3D Viewer)

---

## Formats supportés

| Extension | Notes |
|-----------|--------|
| `.glb` / `.gltf` | glTF 2.0 (textures embarquées) |
| `.fbx` | FBXLoader |
| `.zip` | Archive FBX/glTF + textures |

---

© 2026 CHORFA Allaeddine — [chorfa.fr](https://chorfa.fr)
