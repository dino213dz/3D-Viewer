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
**Dernière mise à jour :** 21 août 2026, 17:08 CEST
**Version :** 2.1.3

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
- Menu contextuel (clic droit)
- Gizmo d’axes (X rouge, Y vert, Z bleu)
- Sol : quadrillage, surface plate ou aucun (éditable)
- Affichage clair / sombre
- Langues : Français, English
- Rotation des lumières, cônes masquables, lumières renommables et repliables

---

## Historique des versions

### 2.1.3 — 21 août 2026, 17:08 CEST
- Barre d’état en bas (messages + info matériau) ; plus de statut dans le menu
- Boutons fenêtre à droite dans l’ordre − + × ; marges barre de titre équilibrées
- Traduction EN étendue (fenêtres, panneaux, boutons, à propos)
- Marges alignées pour Aide / À propos / Langues dans Fichier
- Date de mise à jour À propos

### 2.1.2 — 21 août 2026, 16:37 CEST
- Correction menu mobile : se ferme au clic sur un lien ou en dehors

### 2.1.1 — 21 août 2026, 16:25 CEST
- Traduction réelle FR/EN de l’interface
- Sous-menu Sol transparent + surbrillance du menu parent conservée
- Labels dynamiques Afficher / Masquer (gizmo, cônes, thème)
- Menu contextuel clic droit (cadrage, gizmo, wireframe, sol, cônes)
- Édition du sol (clic sur le sol + menu Vue)
- Matériaux : nom sans numéro en en-tête, numéro dans la liste + carré de couleur
- Thème clair style Windows 3.11, accent `#F54927`, icônes et séparateurs noirs
- Boutons de fenêtre à droite, barre affinée, titre centré
- Icône unique pour les cônes de lumière
- Clic sur « 3D Viewer » → À propos

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
- Gizmo dans menu Vue (plus dans Éditer)
- Sélecteurs de couleur synchronisés avec la couleur courante

### 2.0.2 — 20 août 2026
- Réinitialiser couleur du ciel
- Afficher / masquer les gizmo
- Matériaux regroupés par nom (plus de doublons)

### 2.0.1 — 20 août 2026
- Clic barre de menu : ferme le sous-menu ouvert
- Rotation des lumières X/Y/Z
- Gizmo d’axes (orientation type Blender)
- Couleur du ciel (arrière-plan) dans Éditer

### 2.0.0 — 20 août 2026 *(majeure)*
- Icônes barre actives : bleu accent (`#6761FF`)
- Matériaux : ordre alphabétique + numérotation `N-Nom`
- Clic 3D → bulle nom du matériau + sélection dans l’éditeur
- Logo **dino213dz** dans la fenêtre À propos

### 1.7.9 — 20 août 2026
- README historique complet
- Bulles (tooltips) sur les boutons de la barre de menu
- Liens visités corrigés ; vert réservé aux fenêtres actives

### 1.7.8 — 20 août 2026
- Boutons barre Matériaux / Lumières : toggle ouvrir/fermer
- À propos : icônes globe / mail / GitHub monochromes
- Liens À propos : vert Xbox, survol accent

### 1.7.7 — 20 août 2026
- Lien GitHub dans À propos
- Raccourcis barre : Matériaux et Lumières

### 1.7.6 — 20 août 2026
- Menu : un seul sous-menu ouvert à la fois (plus de clic + survol simultanés)

### 1.7.5 — 20 août 2026
- Aide : raccourcis clavier + icône « ? »
- Accent `#6761FF` ; feux de fenêtre monochromes
- Vue → Propriétés du fichier
- Panneau latéral : plus de panneau vide (props par défaut / dernière fenêtre)

### 1.7.4 — 20 août 2026
- Historique Annuler/Refaire **par fichier** (compteur non hérité entre fichiers)

### 1.7.3 — 20 août 2026
- Correction cadrage zone visible : objet à côté des fenêtres (pas derrière)

### 1.7.2 — 20 août 2026
- Repositionnement des fenêtres paysage (haut-gauche) / portrait (bas)
- Cadrer zone visible (menu Vue + barre)

### 1.7.1 — 20 août 2026
- Fix application matériau (2e modification)
- Refaire / Redo (menu + barre + Ctrl+Y)
- Couleurs personnalisées enregistrées + champ hex

### 1.7.0 — 20 août 2026
- Correction bouton Annuler (menu + barre)
- Icônes SVG monochromes blanches
- Bouton barre : recadrer la vue
- Échelle texture X/Y/Z
- Menu Vue : suppression de « Recentrer la caméra »

### 1.6.9 — 20 août 2026
- Correction critique : erreur de syntaxe dans `performUndo` (script JS ne se chargeait plus)

### 1.6.8 — 20 août 2026
- Menu réordonné : Fichier → Éditer → Vue → Aide → À propos
- Icônes menu + bouton Annuler à droite de la barre
- Correction : modif. lumières ne réinitialise plus les matériaux

### 1.6.7 — 20 août 2026
- Menu **Éditer** (remplace Paramètres + Matériaux)
- Historique **Annuler** illimité + Ctrl/Cmd+Z

### 1.6.6 — 20 août 2026
- Transparence des fenêtres / menus à **66 %**

### 1.6.5 — 19–20 août 2026
- Aucune fenêtre ouverte au démarrage

### 1.6.4 — 19–20 août 2026
- Fenêtre **Charger un fichier** (glisser-déposer + Parcourir)
- Transparence glass ~85 %

### 1.6.3 — 19–20 août 2026
- Réinitialiser matériaux d’origine

### 1.6.2 — 19–20 août 2026
- Chargement fichier uniquement via menu Fichier

### 1.6.1 — 19–20 août 2026
- Auteur : CHORFA Allaeddine
- Modèle par défaut **4x4.glb** (puis `modele.glb`)

### 1.6.0 — 19 août 2026
- Fenêtres glass flottantes (déplacer, redimensionner, min/max)
- Menu se ferme au clic sur une action

### 1.5.x — 19 août 2026
- Menu responsive, conservation de la sélection matériau
- Barre de titre Mac (feux + croix)

### 1.4.x – 1.2.x — 19 août 2026
- Panneau matériaux, auto-scale, menu horizontal macOS
- Lumières configurables, wireframe, cadrage
- Support ZIP / FBX / glTF, OrbitControls souris + tactile

### 1.0 – 1.1 — 19 août 2026
- Première version du visualiseur 3D web (Car3D Tester → 3D Viewer)

---

## Formats supportés

| Extension | Notes |
|-----------|--------|
| `.glb` / `.gltf` | glTF 2.0 (textures embarquées) |
| `.fbx` | FBXLoader |
| `.zip` | Archive FBX/glTF + textures |

---

© 2026 CHORFA Allaeddine — [chorfa.fr](https://chorfa.fr)
