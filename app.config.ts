export default defineAppConfig({
  ui: {
    colors: {
      primary: 'pastel-green',
      secondary: 'stone',
      neutral: 'stone',
      success: 'pastel-green',
      info: 'stone',
      warning: 'yellow',
      error: 'rose',
    },
    icons: {
      arrowDown: 'ph:arrow-down-bold',
      arrowLeft: 'ph:arrow-left-bold',
      arrowRight: 'ph:arrow-right-bold',
      arrowUp: 'ph:arrow-up-bold',
      caution: 'ph:warning-bold',
      check: 'ph:check-bold',
      chevronDoubleLeft: 'ph:caret-double-left-bold',
      chevronDoubleRight: 'ph:caret-double-right-bold',
      chevronDown: 'ph:caret-down-bold',
      chevronLeft: 'ph:caret-left-bold',
      chevronRight: 'ph:caret-right-bold',
      chevronUp: 'ph:caret-up-bold',
      close: 'ph:x-bold',
      copy: 'ph:copy-bold',
      copyCheck: 'ph:copy-bold',
      dark: 'ph:moon-bold',
      drag: 'ph:dots-six-vertical-bold',
      ellipsis: 'ph:dots-three-vertical-bold',
      error: 'ph:x-circle-bold',
      external: 'ph:arrow-square-out-bold',
      eye: 'ph:eye-bold',
      eyeOff: 'ph:eye-slash-bold',
      file: 'ph:file-bold',
      folder: 'ph:folder-bold',
      folderOpen: 'ph:folder-open-bold',
      hash: 'ph:hash-bold',
      info: 'ph:info-bold',
      light: 'ph:sun-bold',
      loading: 'ph:spinner-bold',
      menu: 'ph:list-bold',
      minus: 'ph:minus-bold',
      panelClose: 'ph:sidebar-simple-bold',
      panelOpen: 'ph:sidebar-bold',
      plus: 'ph:plus-bold',
      reload: 'ph:arrow-counter-clockwise-bold',
      search: 'ph:magnifying-glass-bold',
      stop: 'ph:stop-bold',
      success: 'ph:check-circle-bold',
      system: 'ph:monitor-bold',
      tip: 'ph:lightbulb-bold',
      upload: 'ph:upload-bold',
      warning: 'ph:warning-bold',
    },
    input: {
      slots: {
        root: `w-full`,
      },
    },
    button: {
      variants: {
        size: {
          xl: {
            base: 'px-4 py-2 text-lg gap-2',
          },
          lg: {
            base: 'px-3.5 py-1.75 text-base gap-2',
          },
          md: {
            base: 'px-3 py-1.5 text-md gap-1.5',
          }
        }
      }
    },
    pageCard: {
      slots: {
        description: 'text-sm text-ui-text-dimmed',
        container: '!p-5 !flex-row !gap-2',
      }
    },
    selectMenu: {
      slots: {
        content: 'min-w-fit'
      }
    },
    dashboardSidebar: {
      slots: {
        root: 'bg-muted',
      }
    }
  }
});
