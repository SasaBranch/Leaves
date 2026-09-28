// SC-11 ページ編集（基本設計書 4.3、詳細設計書 9.12）。
// 元の画像の上に四隅のハンドルを重ね、ドラッグで台形補正の四隅を決める。回転・全体・元に戻すもここで行う
import type { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Maximize, RotateCw, Undo2 } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';

import { EDIT_MAGNIFIER_SCALE } from '@/config';
import { isAppError } from '@/domain/errors';
import {
  clampPoint,
  displayAspectRatio,
  FULL_IMAGE_CORNERS,
  isValidQuadrilateral,
  rotateClockwise,
  toDisplayPoint,
  toOriginalPoint,
} from '@/domain/pageEdit';
import type { PageEdit, PageId, PageRotation, Point } from '@/domain/types';
import { useDataQuery } from '@/hooks/useDataQuery';
import { editPage, findPageEditSource, revertPageEdit } from '@/services/pageEdits';
import { useShelf } from '@/state/openShelf';
import { useTheme } from '@/theme/useTheme';
import { errorMessages } from '@/ui/errorMessages';
import { storedImageSource } from '@/ui/imageSource';

/** 四隅のハンドルの直径。指で掴みやすい大きさ（タップ領域 44pt 以上は hitSlop で確保） */
const HANDLE_SIZE = 28;
const HANDLE_HIT_SLOP = 12;
/** ハンドルが画面の端で切れないよう、画像の周りに空ける余白（上下） */
const STAGE_PADDING = 24;
/**
 * 左右の余白。画面の左右の端から指を動かすと「戻る」のジェスチャーになる
 * （Android のジェスチャーナビゲーション、iOS の左端スワイプ）ため、ハンドルのタップ領域まで端から離す
 */
const STAGE_PADDING_HORIZONTAL = 48;
/** 拡大鏡の直径と、指からずらす距離（指で隠れないように上に出す） */
const MAGNIFIER_SIZE = 112;
const MAGNIFIER_OFFSET = 80;
/** 拡大鏡の中心に出す印の直径（指の下の位置を示す） */
const CROSSHAIR_SIZE = 12;

type EditSource = Awaited<ReturnType<typeof findPageEditSource>>;

export default function PageEditScreen() {
  const { page } = useLocalSearchParams<{ id: string; page: string }>();
  const pageId = page as PageId;
  const shelf = useShelf();
  const { colors } = useTheme();
  const { data: source } = useDataQuery(`edit:${pageId}`, () => findPageEditSource(shelf, pageId));

  return (
    // モーダルは別のネイティブ画面に表示されるため、ここでもジェスチャーの根が必要
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.stage }]}>
        {source ? <PageEditor pageId={pageId} source={source} /> : null}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function PageEditor({ pageId, source }: { pageId: PageId; source: EditSource }) {
  const shelf = useShelf();
  const { colors, fonts } = useTheme();
  const [rotation, setRotation] = useState<PageRotation>(source.edit?.rotation ?? 0);
  const [corners, setCorners] = useState<PageEdit['corners']>(
    source.edit?.corners ?? FULL_IMAGE_CORNERS,
  );
  const [isSaving, setIsSaving] = useState(false);
  const isUnchanged = !source.edit && rotation === 0 && corners === FULL_IMAGE_CORNERS;

  async function save() {
    if (isUnchanged) {
      router.back();
      return;
    }
    await runSaving(() => editPage(shelf, pageId, { corners, rotation }));
  }

  function confirmRevert() {
    Alert.alert('取り込んだときの画像に戻しますか？', '四隅の調整と回転が取り消されます', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '元に戻す',
        style: 'destructive',
        onPress: () => runSaving(() => revertPageEdit(shelf, pageId)),
      },
    ]);
  }

  async function runSaving(work: () => Promise<void>) {
    setIsSaving(true);
    try {
      await work();
      router.back();
    } catch (error) {
      Alert.alert(isAppError(error) ? errorMessages[error.kind] : errorMessages.pageEditFailed);
      setIsSaving(false);
    }
  }

  return (
    <>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <HeaderButton label="キャンセル" onPress={() => router.back()} disabled={isSaving} />
        <Text
          accessibilityRole="header"
          style={[styles.headerTitle, { color: colors.text, fontFamily: fonts.bold }]}
        >
          ページを編集
        </Text>
        <HeaderButton
          label={isSaving ? '保存中…' : '完了'}
          onPress={save}
          disabled={isSaving}
          bold
        />
      </View>

      <CornerStage
        image={source.originalImage}
        imageSize={source}
        rotation={rotation}
        corners={corners}
        onChangeCorners={setCorners}
      />

      <View style={styles.toolbar}>
        <ToolButton label="回転" onPress={() => setRotation(rotateClockwise(rotation))}>
          <RotateCw size={22} color={colors.text} />
        </ToolButton>
        <ToolButton label="全体" onPress={() => setCorners(FULL_IMAGE_CORNERS)}>
          <Maximize size={22} color={colors.text} />
        </ToolButton>
        {source.edit ? (
          <ToolButton label="元に戻す" onPress={confirmRevert}>
            <Undo2 size={22} color={colors.text} />
          </ToolButton>
        ) : null}
      </View>
    </>
  );
}

/**
 * 回転後の向きで元の画像を表示し、四隅のハンドルと枠を重ねる。
 * ドラッグ中は UI スレッドで位置を動かし、指を離したときだけ React の状態（元の画像の座標）に戻す
 */
function CornerStage({
  image,
  imageSize,
  rotation,
  corners,
  onChangeCorners,
}: {
  image: File;
  imageSize: { width: number; height: number };
  rotation: PageRotation;
  corners: PageEdit['corners'];
  onChangeCorners: (corners: PageEdit['corners']) => void;
}) {
  const { colors } = useTheme();
  const [stage, setStage] = useState<LayoutRectangle | null>(null);
  const displayCorners = useSharedValue(corners.map((point) => toDisplayPoint(point, rotation)));
  const activeIndex = useSharedValue(-1);

  useEffect(() => {
    displayCorners.set(corners.map((point) => toDisplayPoint(point, rotation)));
  }, [corners, rotation, displayCorners]);

  const rect = stage ? fitImage(stage, displayAspectRatio(imageSize, rotation)) : null;

  function commit(display: Point[]) {
    onChangeCorners(
      display.map((point) => toOriginalPoint(point, rotation)) as PageEdit['corners'],
    );
  }

  const polygonProps = useAnimatedProps(() => ({
    points: rect
      ? displayCorners
          .get()
          .map((p) => `${p.x * rect.width},${p.y * rect.height}`)
          .join(' ')
      : '',
  }));

  return (
    <View style={styles.stage} onLayout={(event) => setStage(event.nativeEvent.layout)}>
      {rect ? (
        <View
          style={[
            styles.imageArea,
            { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
          ]}
        >
          <RotatedImage image={image} rotation={rotation} width={rect.width} height={rect.height} />
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <AnimatedPolygon
              animatedProps={polygonProps}
              fill="rgba(95,208,142,0.12)"
              stroke={colors.accent}
              strokeWidth={2}
            />
          </Svg>
          {[0, 1, 2, 3].map((index) => (
            <CornerHandle
              key={index}
              index={index}
              rect={rect}
              displayCorners={displayCorners}
              activeIndex={activeIndex}
              onDragEnd={commit}
            />
          ))}
          <Magnifier
            image={image}
            rotation={rotation}
            rect={rect}
            displayCorners={displayCorners}
            activeIndex={activeIndex}
          />
        </View>
      ) : null}
    </View>
  );
}

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

function CornerHandle({
  index,
  rect,
  displayCorners,
  activeIndex,
  onDragEnd,
}: {
  index: number;
  rect: LayoutRectangle;
  displayCorners: SharedValue<Point[]>;
  activeIndex: SharedValue<number>;
  onDragEnd: (display: Point[]) => void;
}) {
  const { colors } = useTheme();
  const dragStart = useSharedValue<Point>({ x: 0, y: 0 });

  const pan = Gesture.Pan()
    .hitSlop(HANDLE_HIT_SLOP)
    .onBegin(() => {
      dragStart.set(displayCorners.get()[index]!);
      activeIndex.set(index);
    })
    .onUpdate((event) => {
      const moved = clampPoint({
        x: dragStart.get().x + event.translationX / rect.width,
        y: dragStart.get().y + event.translationY / rect.height,
      });
      const candidate = displayCorners.get().map((point, i) => (i === index ? moved : point));
      // 枠がねじれる・つぶれる位置には動かさない（基本設計書 SC-11）
      if (isValidQuadrilateral(candidate as PageEdit['corners'])) displayCorners.set(candidate);
    })
    .onFinalize(() => {
      activeIndex.set(-1);
      runOnJS(onDragEnd)(displayCorners.get());
    });

  const style = useAnimatedStyle(() => {
    const point = displayCorners.get()[index]!;
    return {
      left: point.x * rect.width - HANDLE_SIZE / 2,
      top: point.y * rect.height - HANDLE_SIZE / 2,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessibilityLabel={`${CORNER_LABELS[index]}の角`}
        style={[styles.handle, { borderColor: colors.accent, backgroundColor: colors.bg }, style]}
      />
    </GestureDetector>
  );
}

const CORNER_LABELS = ['左上', '右上', '右下', '左下'];

/** ドラッグ中のハンドルの下を拡大して、指の上に出す（紙の角に合わせやすくするため） */
function Magnifier({
  image,
  rotation,
  rect,
  displayCorners,
  activeIndex,
}: {
  image: File;
  rotation: PageRotation;
  rect: LayoutRectangle;
  displayCorners: SharedValue<Point[]>;
  activeIndex: SharedValue<number>;
}) {
  const { colors } = useTheme();
  const scaledWidth = rect.width * EDIT_MAGNIFIER_SCALE;
  const scaledHeight = rect.height * EDIT_MAGNIFIER_SCALE;

  const frameStyle = useAnimatedStyle(() => {
    const point = displayCorners.get()[Math.max(activeIndex.get(), 0)]!;
    const x = point.x * rect.width;
    const y = point.y * rect.height;
    // 上に出す余地がなければ下に出す
    const above = y - MAGNIFIER_OFFSET - MAGNIFIER_SIZE / 2 >= -rect.y;
    return {
      opacity: activeIndex.get() >= 0 ? 1 : 0,
      left: x - MAGNIFIER_SIZE / 2,
      top: y + (above ? -MAGNIFIER_OFFSET : MAGNIFIER_OFFSET) - MAGNIFIER_SIZE / 2,
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const point = displayCorners.get()[Math.max(activeIndex.get(), 0)]!;
    return {
      transform: [
        { translateX: MAGNIFIER_SIZE / 2 - point.x * scaledWidth },
        { translateY: MAGNIFIER_SIZE / 2 - point.y * scaledHeight },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.magnifier,
        { borderColor: colors.accent, backgroundColor: colors.stage },
        frameStyle,
      ]}
    >
      <Animated.View style={contentStyle}>
        <RotatedImage image={image} rotation={rotation} width={scaledWidth} height={scaledHeight} />
      </Animated.View>
      <View style={[styles.crosshair, { borderColor: colors.accent }]} />
    </Animated.View>
  );
}

/** 回転後の大きさ（width × height）の枠に、元の画像を回して表示する */
function RotatedImage({
  image,
  rotation,
  width,
  height,
}: {
  image: File;
  rotation: PageRotation;
  width: number;
  height: number;
}) {
  const isSideways = rotation % 180 !== 0;
  const imageWidth = isSideways ? height : width;
  const imageHeight = isSideways ? width : height;
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Image
        source={storedImageSource(image, String(image.modificationTime))}
        contentFit="fill"
        style={{
          position: 'absolute',
          width: imageWidth,
          height: imageHeight,
          left: (width - imageWidth) / 2,
          top: (height - imageHeight) / 2,
          transform: [{ rotate: `${rotation}deg` }],
        }}
      />
    </View>
  );
}

/** 余白を除いた舞台に、縦横比を保って画像を最大の大きさで置く位置 */
function fitImage(stage: LayoutRectangle, aspectRatio: number): LayoutRectangle {
  const maxWidth = stage.width - STAGE_PADDING_HORIZONTAL * 2;
  const maxHeight = stage.height - STAGE_PADDING * 2;
  const width = Math.min(maxWidth, maxHeight * aspectRatio);
  const height = width / aspectRatio;
  return { x: (stage.width - width) / 2, y: (stage.height - height) / 2, width, height };
}

function HeaderButton({
  label,
  onPress,
  disabled,
  bold = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  bold?: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.headerButton, { opacity: disabled ? 0.5 : 1 }]}
    >
      <Text
        style={{
          color: colors.accentText,
          fontFamily: bold ? fonts.bold : fonts.medium,
          fontSize: 15,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ToolButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.toolButton}
    >
      {children}
      <Text style={{ color: colors.text, fontFamily: fonts.regular, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { minWidth: 72, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16 },
  stage: { flex: 1 },
  imageArea: { position: 'absolute' },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 3,
  },
  magnifier: {
    position: 'absolute',
    width: MAGNIFIER_SIZE,
    height: MAGNIFIER_SIZE,
    borderRadius: MAGNIFIER_SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  crosshair: {
    position: 'absolute',
    left: (MAGNIFIER_SIZE - CROSSHAIR_SIZE) / 2,
    top: (MAGNIFIER_SIZE - CROSSHAIR_SIZE) / 2,
    width: CROSSHAIR_SIZE,
    height: CROSSHAIR_SIZE,
    borderRadius: CROSSHAIR_SIZE / 2,
    borderWidth: 1.5,
  },
  toolbar: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 8 },
  toolButton: { width: 88, height: 60, alignItems: 'center', justifyContent: 'center', gap: 5 },
});
