Pod::Spec.new do |s|
  s.name           = 'FolderAccess'
  s.version        = '1.0.0'
  s.summary        = 'Security-scoped bookmarks and iCloud downloads'
  s.description    = 'Keeps access to shelves outside the app and requests iCloud downloads for Leaves (ADR 0025)'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
