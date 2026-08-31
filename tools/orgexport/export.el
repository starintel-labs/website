;;; export.el --- Deterministic Org export for the StarIntel website -*- lexical-binding: t; -*-
;;
;; Batch entry point. Emits, per Org file, a body-only HTML fragment plus a
;; JSON metadata sidecar with stable heading anchors. No CMS, no side effects
;; beyond the requested output directory.
;;
;; Usage:
;;   emacs --batch -Q --load tools/orgexport/export.el -- <outdir> <file.org>...
;;
;; Output per file <slug>:
;;   <outdir>/<slug>.html        body-only HTML fragment
;;   <outdir>/<slug>.meta.json   {slug,title,date,author,description,tags,filetags,
;;                                status,approval_state,approval_actor,approval_evidence,
;;                                approval_decided_at,approval_schema,id,anchors}

(require 'org)
(require 'ox-html)
(require 'org-element)
(require 'json)
(require 'cl-lib)

(add-to-list 'load-path
             (file-name-directory (or load-file-name buffer-file-name)))
(require 'htmlize)

(defvar starintel-org--interesting-keywords
  '("TITLE" "DATE" "AUTHOR" "DESCRIPTION" "SLUG" "TAGS" "FILETAGS"
    "STATUS" "APPROVAL_SCHEMA" "APPROVAL_STATE" "APPROVAL_ACTOR"
    "APPROVAL_EVIDENCE" "APPROVAL_DECIDED_AT" "APPROVAL_BASE_COMMIT"
    "APPROVAL_BASE_BLOB" "ROAM_ALIAS" "PUBLICATION"))

(defun starintel-org--slug (s)
  "Derive a stable url slug from string S."
  (setq s (downcase (or s "")))
  (setq s (replace-regexp-in-string "[^a-z0-9]+" "-" s))
  (setq s (replace-regexp-in-string "\\`-+\\|-+$" "" s))
  s)

(defun starintel-org--file-slug (file keywords)
  "Choose the output slug for FILE given KEYWORDS."
  (or (cdr (assoc "SLUG" keywords))
      (let ((title (cdr (assoc "TITLE" keywords))))
        (if (and title (not (string-empty-p title)))
            (starintel-org--slug title)
          (starintel-org--slug (file-name-base file))))))

(defun starintel-org--file-keywords (buffer)
  "Extract file-level keyword metadata from BUFFER."
  (with-current-buffer buffer
    (let ((tree (org-element-parse-buffer))
          (out nil))
      (org-element-map tree 'keyword
        (lambda (k)
          (let* ((key (org-element-property :key k))
                 (val (string-trim (or (org-element-property :value k) ""))))
            (when (and (member key starintel-org--interesting-keywords)
                       (not (assoc key out))
                       (not (string-empty-p val)))
              (push (cons key val) out)))))
      (org-element-map tree 'node-property
        (lambda (np)
          (let* ((key (upcase (org-element-property :key np)))
                 (val (string-trim (or (org-element-property :value np) ""))))
            (when (and (string= key "ID") (not (assoc "ID" out)) (not (string-empty-p val)))
              (push (cons "ID" val) out)))))
      out)))

(defun starintel-org--stable-heading-ids (html)
  "Replace org-generated heading ids with slugs of the heading text."
  (let ((case-fold-search nil)
        (pos 0))
    (while (string-match "<h\\([1-6]\\)\\s-+id=\"[^\"]*\"\\s-*>\\([^<]*\\)<" html pos)
      (let* ((level (match-string 1 html))
             (text (match-string 2 html))
             (slug (starintel-org--slug (replace-regexp-in-string "&[a-z]+;" " " text)))
             (replacement (format "<h%s id=\"%s\">%s<" level slug text)))
        (setq html (replace-match replacement t t html))
        (setq pos (+ (match-beginning 0) (length replacement)))))
    html))

(defun starintel-org--collect-anchors (html)
  "Return the list of heading ids present in HTML."
  (let ((anchors nil)
        (pos 0))
    (while (string-match "<h\\([1-6]\\)\\s-+id=\"\\([^\"]*\\)\"" html pos)
      (push (match-string 2 html) anchors)
      (setq pos (match-end 0)))
    (nreverse anchors)))

(defun starintel-org--export-file (file outdir)
  "Export one Org FILE into OUTDIR as HTML fragment + metadata JSON."
  (let* ((buffer (find-file-noselect file))
         (keywords (starintel-org--file-keywords buffer))
         (slug (starintel-org--file-slug file keywords))
         (org-html-htmlize-output-type 'css)
         (org-html-htmlize-font-prefix "org-")
         (org-html-include-scripts nil)
         (org-html-include-style nil)
         (org-html-validation-link nil)
         (org-html-postamble nil)
         (org-html-preamble nil)
         (org-html-container-element "div")
         (org-export-with-section-numbers nil)
         (org-export-with-smart-quotes t)
         (org-export-with-sub-superscripts '{})
         (org-export-with-broken-links 'mark))
    (let* ((html (with-current-buffer buffer
                   (org-export-as 'html nil nil t)))
           (html (starintel-org--stable-heading-ids html))
           (anchors (starintel-org--collect-anchors html))
           (meta `((slug . ,slug)
                   (title . ,(cdr (assoc "TITLE" keywords)))
                   (date . ,(cdr (assoc "DATE" keywords)))
                   (author . ,(cdr (assoc "AUTHOR" keywords)))
                   (description . ,(cdr (assoc "DESCRIPTION" keywords)))
                   (tags . ,(cdr (assoc "TAGS" keywords)))
                   (filetags . ,(cdr (assoc "FILETAGS" keywords)))
                   (status . ,(cdr (assoc "STATUS" keywords)))
                   (publication . ,(cdr (assoc "PUBLICATION" keywords)))
                   (approval_schema . ,(cdr (assoc "APPROVAL_SCHEMA" keywords)))
                   (approval_state . ,(cdr (assoc "APPROVAL_STATE" keywords)))
                   (approval_actor . ,(cdr (assoc "APPROVAL_ACTOR" keywords)))
                   (approval_evidence . ,(cdr (assoc "APPROVAL_EVIDENCE" keywords)))
                   (approval_decided_at . ,(cdr (assoc "APPROVAL_DECIDED_AT" keywords)))
                   (approval_base_commit . ,(cdr (assoc "APPROVAL_BASE_COMMIT" keywords)))
                   (approval_base_blob . ,(cdr (assoc "APPROVAL_BASE_BLOB" keywords)))
                   (id . ,(cdr (assoc "ID" keywords)))
                   (anchors . ,(vconcat anchors))
                   (exported_at . ,(format-time-string "%Y-%m-%dT%H:%M:%SZ" nil t)))))
      (with-temp-file (expand-file-name (concat slug ".html") outdir)
        (insert html))
      (with-temp-file (expand-file-name (concat slug ".meta.json") outdir)
        (insert (json-encode meta) "\n"))
      (message "exported %s -> %s" file slug))))

(defun starintel-org/export/batch ()
  "Batch entry: (command-line-args-left) = ([--] OUTDIR FILE...)."
  (let* ((args (if (string= (car command-line-args-left) "--")
                   (cdr command-line-args-left)
                 command-line-args-left))
         (outdir (expand-file-name (or (car args) (error "usage: export.el OUTDIR FILE..."))))
         (files (cdr args)))
    (when (length< args 2) (error "usage: export.el OUTDIR FILE..."))
    (setq command-line-args-left nil)
    (make-directory outdir t)
    (let ((failures 0))
      (dolist (file files)
        (condition-case err
            (starintel-org--export-file (expand-file-name file) outdir)
          (error (message "EXPORT FAILED %s: %S" file err)
                 (setq failures (1+ failures)))))
      (when (> failures 0)
        (kill-emacs 1)))))

;; When loaded via `emacs --batch --load export.el -- OUTDIR FILE...', run
;; immediately and exit. The trailing kill-emacs keeps the batch process from
;; waiting for further command-line processing.
(when (and noninteractive (>= (length command-line-args-left) 2))
  (starintel-org/export/batch)
  (kill-emacs 0))

;;; export.el ends here.
